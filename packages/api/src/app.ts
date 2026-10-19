import { existsSync, readFileSync } from "node:fs";
import { createAuditLog, MemoryAuditStore } from "@nightingale/audit";
import {
  FakeCondenser,
  FakeDiarizer,
  FakePhotoCaptioner,
  FakeTranscriber,
  CONDENSE_PROMPT_VERSION,
  normalizeWav,
  repairWav,
  wavLoudestSecondDbfs,
  wavSeconds,
  wavSlice,
  type KnownSpeaker,
  type RawSegment,
  type PhotoCaptioner,
  type PipelineDeps,
} from "@nightingale/pipeline";
import { AssetKind, PhotoPurpose, Transcript, type DraftNote } from "@nightingale/schema";
import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { dashboardHtml } from "./dashboard.js";
import {
  clockStamp,
  noopDrillStore,
  sessionDirName,
  transcriptEntries,
  type DrillSession,
  type DrillStore,
  type LiveAsset,
} from "./drills.js";
import { LiveStream, type LiveAsrFactory } from "./live-transcribe.js";
import { HttpError } from "./http-error.js";
import { createLiveHub, type LiveHub } from "./live.js";
import { createUploadTracker } from "./uploads.js";
import type { VaultStore } from "./vault.js";

// not the full Asset schema, just what the init call actually needs. reuses the
// enums from @nightingale/schema so "audio"/"photo"/etc stay defined in one place
const InitAssetRequest = z.object({
  kind: AssetKind,
  sha256: z.string().length(64),
  photoPurpose: PhotoPurpose.optional(),
  /** when the device started recording this capture, unix ms. lets the server tell
   * whether the live stream already transcribed that stretch */
  capturedAt: z.number().int().positive().optional(),
  /** the device's clock right now, unix ms. the pi has no clock battery and can be
   * minutes off until it syncs, this lets the server correct capturedAt */
  deviceNow: z.number().int().positive().optional(),
});

const DevLogBatch = z.object({
  deviceId: z.string().min(1).max(64),
  // the device's session id (= its capture id). every new device connection is its own
  // drill session with its own folder, see drills.ts
  sessionId: z.string().min(1).max(128).optional(),
  lines: z
    .array(
      z.object({
        ts: z.number(),
        level: z.enum(["info", "warn", "error"]),
        msg: z.string().max(2000),
      }),
    )
    .max(500),
});

const defaultPipelineDeps: PipelineDeps = {
  transcriber: new FakeTranscriber(),
  diarizer: new FakeDiarizer(),
  condenser: new FakeCondenser(),
};

// real identity/auth is milestone 4 (access control), these headers are just a
// stand-in so audit events have someone to point at in the meantime
function actorFrom(c: Context) {
  return {
    actorId: c.req.header("x-actor-id") ?? "unknown",
    actorRole: c.req.header("x-actor-role") ?? "unknown",
  };
}

export function createApp(
  vault: VaultStore,
  auditLog = createAuditLog(new MemoryAuditStore()),
  pipelineDeps: PipelineDeps = defaultPipelineDeps,
  captioner: PhotoCaptioner = new FakePhotoCaptioner(),
  live: LiveHub = createLiveHub(),
  {
    // a chunk whose loudest second is quieter than this skips transcription entirely
    silenceDbfs = -50,
    drills = noopDrillStore,
    // word-by-word live transcription (live-transcribe.ts). without it the device's
    // live audio stream is refused and everything falls back to the 30s chunks
    liveAsr,
  }: { silenceDbfs?: number; drills?: DrillStore; liveAsr?: LiveAsrFactory } = {},
) {
  const tracker = createUploadTracker(vault);
  const capturedAtById = new Map<string, number>();
  const draftNotes = new Map<string, DraftNote>();
  const captions = new Map<string, string>();

  // drill sessions (one per device connection), restored from disk so a restart
  // doesn't wipe anything. anything that was mid-processing when the api died is
  // never going to finish, mark it failed instead of "transcribing..." forever
  const sessions = new Map<string, DrillSession>();
  const assetsById = new Map<string, LiveAsset>();
  for (const session of drills.load()) {
    if (session.epcrStatus === "updating") session.epcrStatus = session.epcr ? "ready" : "failed";
    for (const asset of session.assets) {
      if (asset.status === "processing") asset.status = "failed";
      assetsById.set(asset.assetId, asset);
    }
    sessions.set(session.captureId, session);
  }
  // where log lines with no session go: whichever session was active most recently.
  // stays empty after a restart until a device talks, so api restarts don't get
  // written into an old test's console
  let currentSessionId: string | undefined;

  // "new session" button: the pi keeps its own session id the whole time it's on, so a
  // fresh test started from the dashboard is a split: from that moment, everything from
  // that device session lands in the new one. old session stays exactly as it was
  const splits = new Map<string, { since: number; sessionId: string }[]>();
  for (const session of sessions.values()) {
    if (session.deviceSessionId) {
      const list = splits.get(session.deviceSessionId) ?? [];
      list.push({ since: session.startedAt, sessionId: session.captureId });
      splits.set(session.deviceSessionId, list.sort((a, b) => a.since - b.since));
    }
  }
  // which session a device's data belongs to, given when it was captured
  const resolveSession = (deviceSessionId: string, at = Date.now()) => {
    let id = deviceSessionId;
    for (const split of splits.get(deviceSessionId) ?? []) if (split.since <= at) id = split.sessionId;
    return id;
  };
  // the device session most recently heard from, what the button splits
  let lastDeviceSessionId: string | undefined;

  // backlog = chunks from an earlier boot that sat in the pi's queue (laptop was off, or
  // the pi lost power) and only upload now. they get their own session like any other,
  // but the dashboard doesn't jump to them
  const sessionFor = (captureId: string, deviceId?: string, backlog = false) => {
    let session = sessions.get(captureId);
    if (!session) {
      const startedAt = Date.now();
      session = { captureId, dir: sessionDirName(captureId, startedAt), deviceId, startedAt, assets: [] };
      if (backlog) session.backlog = true;
      sessions.set(captureId, session);
      drills.saveSession(session);
      live.log(
        "server",
        "info",
        backlog
          ? `catching up on ${captureId}, audio from an earlier boot that was still in the pi's queue. saving to drills/${session.dir}, the feed stays on the current session`
          : `new drill session ${captureId}, saving to drills/${session.dir}`,
        { sessionId: captureId },
      );
    } else if (deviceId && !session.deviceId) {
      session.deviceId = deviceId;
      drills.saveSession(session);
    }
    if (!session.backlog) currentSessionId = captureId;
    return session;
  };

  // speaker labels: every voice gets "Person N" the first time it's heard, plus a short
  // reference clip of it, and the clips go along with every later chunk so the
  // diarizing transcriber keeps calling that voice "Person N" (api takes up to 4)
  const speakerRefs = new Map<string, KnownSpeaker[]>();
  const labelSpeakers = (session: DrillSession, chunk: Uint8Array, segments: RawSegment[]) => {
    const refs = speakerRefs.get(session.captureId) ?? [];
    speakerRefs.set(session.captureId, refs);
    const names = (session.speakers ??= []);
    const rename = new Map<string, string>();
    // longest stretch per label, merging back-to-back segments from the same voice
    const runs = new Map<string, { start: number; end: number }>();
    const runList: { speaker: string; start: number; end: number }[] = [];
    for (const seg of segments) {
      const last = runList.at(-1);
      if (last && last.speaker === seg.speaker) last.end = seg.end;
      else runList.push({ speaker: seg.speaker, start: seg.start, end: seg.end });
    }
    for (const run of runList) {
      const best = runs.get(run.speaker);
      if (!best || run.end - run.start > best.end - best.start) runs.set(run.speaker, run);
    }
    for (const seg of segments) {
      if (names.includes(seg.speaker) || rename.has(seg.speaker)) continue;
      const name = `Person ${names.length + 1}`;
      names.push(name);
      rename.set(seg.speaker, name);
      const run = runs.get(seg.speaker);
      if (run && refs.length < 4) {
        const clip = wavSlice(normalizeWav(chunk), run.start, Math.min(run.start + 10, Math.max(run.end, run.start + 2)));
        if (clip) {
          refs.push({ name, reference: `data:audio/wav;base64,${Buffer.from(clip).toString("base64")}` });
          drills.saveFile(session, `speakers/${name.replace(" ", "-").toLowerCase()}.wav`, clip);
        }
      }
      live.log("server", "info", `new voice heard, calling it ${name}`, { sessionId: session.captureId });
    }
    return segments.map((seg) => ({ ...seg, speaker: rename.get(seg.speaker) ?? seg.speaker }));
  };

  live.subscribe((event) => {
    if (event.type !== "log") return;
    const id = event.line.sessionId ?? currentSessionId;
    const session = id ? sessions.get(id) : undefined;
    if (session) drills.appendLog(session, event.line);
  });

  const setLive = (assetId: string, patch: Partial<LiveAsset>) => {
    const asset = assetsById.get(assetId);
    if (asset) {
      Object.assign(asset, patch);
      const session = sessions.get(asset.captureId);
      if (session) drills.saveSession(session);
    }
    live.update(assetId);
  };

  // the session-wide epcr: after every transcribed chunk, re-run the condenser over the
  // whole session transcript so the form fills in and corrects itself. one run at a time
  // per session, and if chunks pile up meanwhile only the latest state gets condensed
  const epcrRuns = new Map<string, { running: boolean; again: boolean }>();
  const refreshEpcr = async (captureId: string) => {
    const state = epcrRuns.get(captureId) ?? { running: false, again: false };
    epcrRuns.set(captureId, state);
    if (state.running) {
      state.again = true;
      return;
    }
    state.running = true;
    try {
      do {
        state.again = false;
        await condenseSession(captureId);
      } while (state.again);
    } finally {
      state.running = false;
    }
  };

  const condenseSession = async (captureId: string) => {
    const session = sessions.get(captureId);
    if (!session) return;
    // live turns + any chunks the live stream missed, in order. "(hh:mm:ss)" in front of
    // each one, the condenser prompt knows what it means
    const entries = transcriptEntries(session);
    if (!entries.length) return;
    const chunks = entries;
    const segments = entries.map((e) => ({
      start: 0,
      end: 0,
      speaker: e.speaker ?? "unlabelled",
      text: `(${new Date(e.at).toLocaleTimeString("en-GB")}) ${e.text}`,
      confidence: 1,
    }));
    const transcript = Transcript.parse({
      id: crypto.randomUUID(),
      captureId,
      provider: "session",
      modelVersion: "merged",
      segments,
    });

    session.epcrStatus = "updating";
    live.update(`epcr:${captureId}`);
    const started = Date.now();
    try {
      const epcr = await pipelineDeps.condenser.condense(transcript, {
        captureId,
        modelVersion: "demo-1",
        promptVersion: CONDENSE_PROMPT_VERSION,
      });
      Object.assign(session, {
        epcr,
        epcrStatus: "ready",
        epcrUpdatedAt: Date.now(),
        epcrChunks: chunks.length,
      });
      live.log(
        "server",
        "info",
        `ePCR updated from ${chunks.length} transcript line(s) in ${((Date.now() - started) / 1000).toFixed(1)}s (${Object.keys(epcr.sections).length} sections filled)`,
        { sessionId: captureId },
      );
    } catch (err) {
      session.epcrStatus = "failed";
      live.log("server", "error", `ePCR update failed: ${(err as Error).message}`, { sessionId: captureId });
    }
    drills.saveSession(session);
    live.update(`epcr:${captureId}`);
  };
  const app = new Hono();

  // ugly demo dashboard, not the real tiered-access one from ARCHITECTURE.md
  // section 9, see dashboard.ts for the caveat
  app.get("/", (c) => c.html(dashboardHtml));

  app.post("/captures/:captureId/assets", async (c) => {
    const body = InitAssetRequest.parse(await c.req.json());
    const result = await tracker.initAsset(c.req.param("captureId"), body);
    if (body.capturedAt) {
      const offset = body.deviceNow ? Date.now() - body.deviceNow : 0;
      capturedAtById.set(result.assetId, body.capturedAt + offset);
    }
    await auditLog.record({
      ...actorFrom(c),
      action: "vault_access",
      recordType: "Asset",
      recordId: result.assetId,
      reason: "init upload",
    });
    return c.json(result, 201);
  });

  app.put("/assets/:assetId/parts/:partNumber", async (c) => {
    const assetId = c.req.param("assetId");
    const partNumber = Number(c.req.param("partNumber"));
    if (!Number.isInteger(partNumber) || partNumber < 1) {
      throw new HttpError(400, "partNumber must be a positive integer");
    }
    const body = new Uint8Array(await c.req.arrayBuffer());
    const result = await tracker.uploadPart(assetId, partNumber, body);
    await auditLog.record({
      ...actorFrom(c),
      action: "vault_access",
      recordType: "Asset",
      recordId: assetId,
      reason: `part ${partNumber}`,
    });
    return c.json(result);
  });

  app.get("/assets/:assetId", async (c) => {
    const assetId = c.req.param("assetId");
    const result = tracker.getStatus(assetId);
    await auditLog.record({ ...actorFrom(c), action: "view", recordType: "Asset", recordId: assetId });
    return c.json(result);
  });

  app.post("/assets/:assetId/complete", async (c) => {
    const assetId = c.req.param("assetId");
    const result = await tracker.complete(assetId);
    await auditLog.record({
      ...actorFrom(c),
      action: "vault_access",
      recordType: "Asset",
      recordId: assetId,
      reason: "complete + sha256 verify",
    });

    // only audio goes through the pipeline, a photo has nothing to transcribe.
    // runs inline (not a background job/queue, that's later) so the note is
    // actually ready by the time you ask for it
    const kb = Math.round(result.bytes.length / 1024);
    // a chunk cut off by power loss has a header that says "0 bytes", fix it up first
    const bytes = result.kind === "audio" ? repairWav(result.bytes) : result.bytes;
    // the device's current session comes from its logs / live stream. an upload alone
    // doesn't count, it can be an old chunk from an earlier boot sitting in the queue
    lastDeviceSessionId ??= result.captureId;
    const completedAt = Date.now();
    const sessionId = resolveSession(result.captureId, capturedAtById.get(assetId) ?? completedAt);
    const session = sessionFor(sessionId, undefined, result.captureId !== lastDeviceSessionId);
    const file = `${result.kind === "audio" ? "audio" : "photos"}/${clockStamp(completedAt)}_${assetId.slice(0, 8)}.${result.kind === "audio" ? "wav" : "jpg"}`;
    try {
      drills.saveFile(session, file, bytes);
    } catch (err) {
      live.log("server", "warn", `couldn't save ${file} to the drill folder: ${(err as Error).message}`, { sessionId });
    }
    const capturedAt = capturedAtById.get(assetId);
    capturedAtById.delete(assetId);
    const asset: LiveAsset = {
      assetId,
      captureId: sessionId,
      kind: result.kind,
      completedAt,
      capturedAt,
      status: "processing",
      file,
    };
    session.assets.push(asset);
    assetsById.set(assetId, asset);
    drills.saveSession(session);
    live.update(assetId);
    const started = Date.now();
    const secs = () => ((Date.now() - started) / 1000).toFixed(1);

    const level = result.kind === "audio" ? wavLoudestSecondDbfs(bytes) : null;
    const levelText = level === null ? "" : `, loudest ${level.toFixed(0)} dBFS`;

    // 16 khz mono 16-bit = 32000 bytes a second, minus the 44 byte header
    const durationMs = Math.max(0, ((bytes.length - 44) / 32000) * 1000);
    const chunkStart = capturedAt ?? completedAt - durationMs;
    if (result.kind === "audio") Object.assign(asset, { capturedAt: chunkStart, durationMs });

    if (result.kind === "audio" && (wavSeconds(bytes) ?? 1) < 0.2) {
      // header only, arecord produced nothing (mic not detected / wrong card)
      setLive(assetId, { status: "silent" });
      live.log(
        "server",
        "warn",
        `audio chunk ${assetId} has no audio in it (${kb} KB), the mic gave nothing. check \`arecord -l\` on the pi`,
        { sessionId },
      );
    } else if (result.kind === "audio" && level !== null && level < silenceDbfs) {
      setLive(assetId, { status: "silent", levelDbfs: level });
      live.log(
        "server",
        "warn",
        `audio chunk ${assetId} saved, silent (loudest ${level.toFixed(0)} dBFS), nothing to transcribe`,
        { sessionId },
      );
    } else if (result.kind === "audio") {
      live.log("server", "info", `got audio chunk ${assetId} (${kb} KB${levelText}), labelling speakers...`, {
        sessionId,
      });
      try {
        // same three steps as runPipeline, split up so the transcript shows on the
        // dashboard the moment it exists instead of waiting on the condenser too
        const raw = await pipelineDeps.transcriber.transcribe(bytes, {
          knownSpeakers: speakerRefs.get(sessionId) ?? [],
        });
        const transcript = await pipelineDeps.diarizer.flagNonResponder(
          Transcript.parse({
            id: crypto.randomUUID(),
            captureId: sessionId,
            provider: raw.provider,
            modelVersion: raw.modelVersion,
            segments: raw.segments,
          }),
        );
        // renamed after the non-responder check so it still sees the original labels
        transcript.segments = labelSpeakers(session, bytes, transcript.segments);
        setLive(assetId, {
          status: "ready",
          levelDbfs: level ?? undefined,
          transcript: transcript.segments.map(({ speaker, text, nonResponder, start }) => ({
            speaker,
            text,
            nonResponder,
            at: Math.round(chunkStart + start * 1000),
          })),
        });
        const voices = [...new Set(transcript.segments.map((seg) => seg.speaker))].join(", ");
        live.log(
          "server",
          "info",
          `speakers labelled for ${assetId} in ${secs()}s (${voices || "nobody"}), updating the ePCR...`,
          { sessionId },
        );
        // whole-session form, in the background, see refreshEpcr
        void refreshEpcr(sessionId);

        // the per-chunk note still backs GET /assets/:id/note
        const draftNote = await pipelineDeps.condenser.condense(transcript, {
          captureId: sessionId,
          modelVersion: "demo-1",
          promptVersion: "v1",
        });
        draftNotes.set(assetId, draftNote);
        setLive(assetId, { note: draftNote });
        await auditLog.record({
          ...actorFrom(c),
          action: "edit",
          recordType: "DraftNote",
          recordId: draftNote.id,
          reason: `pipeline produced a draft note for asset ${assetId}`,
        });
      } catch (err) {
        console.error(`pipeline failed for asset ${assetId}:`, err);
        setLive(assetId, { status: "failed" });
        live.log("server", "error", `pipeline failed for ${assetId}: ${(err as Error).message}`, { sessionId });
      }
    } else if (result.kind === "photo") {
      live.log("server", "info", `got photo ${assetId} (${kb} KB), captioning...`, { sessionId });
      try {
        const caption = await captioner.caption(bytes);
        captions.set(assetId, caption);
        setLive(assetId, { status: "ready", caption });
        live.log("server", "info", `caption ready for ${assetId} in ${secs()}s`, { sessionId });
        await auditLog.record({
          ...actorFrom(c),
          action: "edit",
          recordType: "Asset",
          recordId: assetId,
          reason: "captioned photo",
        });
      } catch (err) {
        console.error(`captioning failed for asset ${assetId}:`, err);
        setLive(assetId, { status: "failed" });
        live.log("server", "error", `captioning failed for ${assetId}: ${(err as Error).message}`, { sessionId });
      }
    }

    const { bytes: _bytes, ...response } = result;
    return c.json(response);
  });

  // the whole point of this one: see the note the pipeline produced, as plain json
  app.get("/assets/:assetId/note", (c) => {
    const assetId = c.req.param("assetId");
    const note = draftNotes.get(assetId);
    if (!note) throw new HttpError(404, `no draft note for asset ${assetId} (not audio, or still processing)`);
    return c.json(note);
  });

  // one short caption for a photo, same "not ready yet" semantics as /note
  app.get("/assets/:assetId/caption", (c) => {
    const assetId = c.req.param("assetId");
    const caption = captions.get(assetId);
    if (caption === undefined) {
      throw new HttpError(404, `no caption for asset ${assetId} (not a photo, or still processing)`);
    }
    return c.json({ assetId, caption });
  });

  // see the photo. no viewer/ui yet, this just streams the bytes back so a
  // browser can render them directly
  app.get("/assets/:assetId/download", async (c) => {
    const assetId = c.req.param("assetId");
    const status = tracker.getStatus(assetId);
    if (status.status !== "complete") {
      throw new HttpError(409, `asset ${assetId} isn't complete yet (${status.status})`);
    }
    const bytes = await vault.getObject(status.vaultKey);
    await auditLog.record({
      ...actorFrom(c),
      action: "vault_access",
      recordType: "Asset",
      recordId: assetId,
      reason: "download",
    });
    const contentType = status.kind === "audio" ? "audio/wav" : "image/jpeg";
    // wrapped in a Blob since the vault's Uint8Array isn't guaranteed ArrayBuffer-backed
    // (SharedArrayBuffer is allowed by the type too), which is all Hono's body() wants here
    return c.body(new Blob([bytes]), 200, { "Content-Type": contentType });
  });

  // no access control on this yet either, same milestone 4 caveat as above.
  // mostly here so the audit trail is actually inspectable/demoable right now
  app.get("/_audit", async (c) => {
    const events = await auditLog.list();
    const verified = await auditLog.verify();
    await auditLog.record({ ...actorFrom(c), action: "view", recordType: "AuditLog", recordId: "all" });
    return c.json({ events, verified });
  });

  // dev feed (ARCHITECTURE.md section 9, item 5). the pi posts its log lines here,
  // the dashboard listens on /dev/stream and re-reads /dev/sessions when something lands
  app.post("/dev/logs", async (c) => {
    const batch = DevLogBatch.parse(await c.req.json());
    // a device announcing a session it hasn't uploaded anything for yet still gets its
    // own folder, that's what makes every new connection a new test
    const target = batch.sessionId ? resolveSession(batch.sessionId) : undefined;
    if (batch.sessionId) lastDeviceSessionId = batch.sessionId;
    if (target) sessionFor(target, batch.deviceId);
    for (const line of batch.lines) {
      live.log(batch.deviceId, line.level, line.msg, { ts: line.ts, sessionId: target });
    }
    return c.json({ ok: true, received: batch.lines.length });
  });

  // the device streams raw mic audio here while it records (16 khz mono pcm16, one long
  // chunked request, reconnects if it drops). transcribed word by word, see
  // live-transcribe.ts. partial text goes out as "transcript" events, final utterances
  // get saved to the session
  app.post("/live/:sessionId/audio", async (c) => {
    const deviceSessionId = c.req.param("sessionId");
    lastDeviceSessionId = deviceSessionId;
    // resolved per utterance, so pressing "new session" mid-stream switches over cleanly
    const sessionNow = () => resolveSession(deviceSessionId);
    const sessionId = sessionNow();
    if (!liveAsr) throw new HttpError(503, "live transcription isn't configured (no OPENAI_API_KEY), the 30s chunks still work");
    const body = c.req.raw.body;
    if (!body) throw new HttpError(400, "no audio stream");
    const session = sessionFor(sessionId);
    const since = Date.now();
    const startedAt = new Map<string, number>();
    live.log("server", "info", "live audio connected, transcribing as you speak", { sessionId });

    const stream = new LiveStream(liveAsr, {
      onPartial: (id, text) => {
        if (!startedAt.has(id)) startedAt.set(id, Date.now());
        const turnStart = startedAt.get(id)!;
        live.transcript({ sessionId: resolveSession(deviceSessionId, turnStart), id, text, final: false, startedAt: turnStart });
      },
      onFinal: (id, text) => {
        const turnStart = startedAt.get(id) ?? Date.now();
        startedAt.delete(id);
        const turnSessionId = resolveSession(deviceSessionId, turnStart);
        live.transcript({ sessionId: turnSessionId, id, text, final: true, startedAt: turnStart });
        if (!text) return; // noise that turned out to be nothing
        const turnSession = sessionFor(turnSessionId);
        (turnSession.liveTurns ??= []).push({ id, startedAt: turnStart, endedAt: Date.now(), text });
        drills.saveSession(turnSession);
        live.update(`turn:${turnSessionId}`);
        live.log("server", "info", `said (${text.split(/\s+/).length} words), updating the ePCR`, { sessionId: turnSessionId });
        void refreshEpcr(turnSessionId);
      },
      onError: (message) => live.log("server", "warn", `live transcription: ${message}`, { sessionId: sessionNow() }),
    });

    const reader = body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        stream.feed(value);
      }
    } catch {
      // device dropped off, it'll reconnect
    } finally {
      stream.end();
      (session.liveCoverage ??= []).push([since, Date.now()]);
      drills.saveSession(session);
      live.log("server", "info", "live audio disconnected", { sessionId: sessionNow() });
    }
    return c.json({ ok: true });
  });

  app.get("/dev/sessions", (c) => c.json([...sessions.values()]));

  // the dashboard's "new session" button. starts a fresh session (own drills/ folder,
  // empty epcr, speakers from Person 1) for everything the device sends from now on,
  // without touching the pi. the previous session is kept as it is
  app.post("/dev/sessions/new", (c) => {
    const startedAt = Date.now();
    const captureId = `test_${startedAt}`;
    const session: DrillSession = {
      captureId,
      dir: sessionDirName(captureId, startedAt),
      startedAt,
      assets: [],
      deviceSessionId: lastDeviceSessionId,
    };
    sessions.set(captureId, session);
    if (lastDeviceSessionId) {
      const list = splits.get(lastDeviceSessionId) ?? [];
      list.push({ since: startedAt, sessionId: captureId });
      splits.set(lastDeviceSessionId, list);
    }
    currentSessionId = captureId;
    drills.saveSession(session);
    live.log(
      "server",
      "info",
      lastDeviceSessionId
        ? `NEW SESSION started from the dashboard, everything from now on saves to drills/${session.dir}`
        : `NEW SESSION started from the dashboard (no device connected yet), saving to drills/${session.dir}`,
      { sessionId: captureId },
    );
    live.update(`session:${captureId}`);
    return c.json(session, 201);
  });

  // raw captures saved in a drill folder (photos, audio), see drills.ts
  app.get("/dev/files/:dir/:sub/:name", (c) => {
    const { dir, sub, name } = c.req.param();
    const path = drills.resolveFile(dir, `${sub}/${name}`);
    if (!path || !existsSync(path)) throw new HttpError(404, "no such drill file");
    const type = name.endsWith(".wav") ? "audio/wav" : name.endsWith(".jpg") ? "image/jpeg" : "application/octet-stream";
    return c.body(new Blob([readFileSync(path)]), 200, { "Content-Type": type });
  });

  app.get("/dev/stream", (c) =>
    streamSSE(c, async (stream) => {
      for (const line of live.recentLogs().slice(-300)) {
        await stream.writeSSE({ event: "log", data: JSON.stringify(line) });
      }
      const unsubscribe = live.subscribe((event) => {
        const data = JSON.stringify(
          event.type === "log" ? event.line : event.type === "transcript" ? event.transcript : { assetId: event.assetId },
        );
        stream.writeSSE({ event: event.type, data }).catch(() => {});
      });
      stream.onAbort(unsubscribe);
      // keepalive so proxies and the browser don't drop an idle connection
      while (!stream.aborted) {
        await stream.sleep(15000);
        await stream.writeSSE({ event: "ping", data: "" }).catch(() => {});
      }
      unsubscribe();
    }),
  );

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400 | 404 | 409);
    if (err instanceof z.ZodError) return c.json({ error: "bad request", issues: err.issues }, 400);
    console.error(err);
    return c.json({ error: "something broke on our end" }, 500);
  });

  return app;
}
