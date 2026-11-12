import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createFsCrashpad } from "./crashpad.js";
import { mkdtempSync, readFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFsDrillStore, transcriptEntries, type DrillSession } from "./drills.js";
import { createLiveHub, type LiveEvent } from "./live.js";
import type { LiveAsrFactory } from "./live-transcribe.js";
import { MemoryVaultStore } from "./vault.js";

function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

// Response.json() types as unknown, these are just the shapes we actually read in the asserts below
interface InitAssetResponse {
  assetId: string;
  vaultKey: string;
  nextPartNumber: number;
}
interface PartResponse {
  partNumber: number;
  nextPartNumber: number;
}
interface StatusResponse {
  status: string;
  receivedParts: number[];
}
interface CompleteResponse {
  verified: boolean;
  sha256: string;
}
interface AuditResponse {
  events: { action: string; recordType: string; recordId: string; actorId: string }[];
  verified: { valid: boolean };
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe("ingest api", () => {
  it("requires scoped API-key auth and prevents cross-actor asset reads", async () => {
    const app = createApp(new MemoryVaultStore(), undefined, undefined, undefined, undefined, {
      security: {
        requireAuth: true,
        keys: [
          { id: "device", secret: "device-secret", actorId: "device-1", actorRole: "device", permissions: ["ingest"] },
          { id: "reviewer", secret: "reviewer-secret", actorId: "reviewer-1", actorRole: "ed", permissions: ["read", "audit", "admin"] },
          { id: "other", secret: "other-secret", actorId: "other-1", actorRole: "ed", permissions: ["read"] },
        ],
      },
    });
    const body = { kind: "photo", sha256: "a".repeat(64) };

    expect((await app.request("/captures/cap_1/assets", { method: "POST", body: JSON.stringify(body) })).status).toBe(401);
    const init = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { authorization: "Bearer device-secret", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(init.status).toBe(201);
    const { assetId } = (await init.json()) as { assetId: string };
    expect((await app.request(`/assets/${assetId}`, { headers: { authorization: "Bearer other-secret" } })).status).toBe(403);
    expect((await app.request(`/assets/${assetId}`, { headers: { authorization: "Bearer reviewer-secret" } })).status).toBe(200);
  });

  it("uploads a file across two chunks and verifies it on complete", async () => {
    const app = createApp(new MemoryVaultStore());
    // kind "photo" on purpose, this test is about chunked upload mechanics, not the
    // pipeline. "audio" would route these arbitrary bytes into FakeTranscriber, which
    // expects json, not what this test is checking
    const bytes = new TextEncoder().encode("fake photo bytes for a short drill clip");
    const sha256 = sha256Hex(bytes);
    const chunk1 = bytes.slice(0, 20);
    const chunk2 = bytes.slice(20);

    const initRes = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "photo", sha256 }),
    });
    expect(initRes.status).toBe(201);
    const init = await json<InitAssetResponse>(initRes);
    expect(init.nextPartNumber).toBe(1);

    const part1Res = await app.request(`/assets/${init.assetId}/parts/1`, {
      method: "PUT",
      body: chunk1,
    });
    expect(part1Res.status).toBe(200);
    expect((await json<PartResponse>(part1Res)).nextPartNumber).toBe(2);

    const statusRes = await app.request(`/assets/${init.assetId}`);
    expect((await json<StatusResponse>(statusRes)).receivedParts).toEqual([1]);

    const part2Res = await app.request(`/assets/${init.assetId}/parts/2`, {
      method: "PUT",
      body: chunk2,
    });
    expect(part2Res.status).toBe(200);

    const completeRes = await app.request(`/assets/${init.assetId}/complete`, { method: "POST" });
    expect(completeRes.status).toBe(200);
    const complete = await json<CompleteResponse>(completeRes);
    expect(complete.verified).toBe(true);
    expect(complete.sha256).toBe(sha256);
  });

  it("rejects a part uploaded out of order", async () => {
    const app = createApp(new MemoryVaultStore());
    const bytes = new TextEncoder().encode("short clip");
    const sha256 = sha256Hex(bytes);

    const initRes = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "audio", sha256 }),
    });
    const init = await json<InitAssetResponse>(initRes);

    // server expects part 1 next, sending part 2 should get bounced
    const res = await app.request(`/assets/${init.assetId}/parts/2`, { method: "PUT", body: bytes });
    expect(res.status).toBe(409);
  });

  it("flags a sha256 mismatch instead of silently accepting it", async () => {
    const app = createApp(new MemoryVaultStore());
    const bytes = new TextEncoder().encode("short clip");
    const wrongSha256 = "0".repeat(64);

    const initRes = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "audio", sha256: wrongSha256 }),
    });
    const init = await json<InitAssetResponse>(initRes);

    await app.request(`/assets/${init.assetId}/parts/1`, { method: "PUT", body: bytes });
    const completeRes = await app.request(`/assets/${init.assetId}/complete`, { method: "POST" });
    expect(completeRes.status).toBe(409);

    const statusRes = await app.request(`/assets/${init.assetId}`);
    expect((await json<StatusResponse>(statusRes)).status).toBe("failed");
  });

  it("rejects an init request with a bad kind", async () => {
    const app = createApp(new MemoryVaultStore());
    const res = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "video", sha256: "a".repeat(64) }),
    });
    expect(res.status).toBe(400);
  });

  it("404s on an asset that was never created", async () => {
    const app = createApp(new MemoryVaultStore());
    const res = await app.request("/assets/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("logs an audit event for every mutation and read, chain stays valid", async () => {
    const app = createApp(new MemoryVaultStore());
    // kind "photo" here too, same reason as the chunked-upload test above
    const bytes = new TextEncoder().encode("short clip");
    const sha256 = sha256Hex(bytes);

    const initRes = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor-id": "resp_1", "x-actor-role": "fire" },
      body: JSON.stringify({ kind: "photo", sha256 }),
    });
    const init = await json<InitAssetResponse>(initRes);

    await app.request(`/assets/${init.assetId}/parts/1`, { method: "PUT", body: bytes });
    await app.request(`/assets/${init.assetId}`);
    await app.request(`/assets/${init.assetId}/complete`, { method: "POST" });

    const auditRes = await app.request("/_audit");
    const audit = await json<AuditResponse>(auditRes);

    expect(audit.verified.valid).toBe(true);
    // init, part, view, complete, captioned = 5. the GET /_audit call logs its own view
    // too, but after it's already taken the snapshot, so it shows up on the *next* call
    expect(audit.events.length).toBe(5);
    expect(audit.events[0]!.actorId).toBe("resp_1");
    expect(audit.events[0]!.recordId).toBe(init.assetId);
    expect(audit.events.some((e) => e.action === "view")).toBe(true);
    expect(audit.events.some((e) => e.action === "vault_access")).toBe(true);
  });

  it("runs the pipeline on a completed audio asset and exposes the draft note", async () => {
    const app = createApp(new MemoryVaultStore());
    // FakeTranscriber expects json-encoded segments as the "audio" bytes, see its
    // own comment in @nightingale/pipeline for why
    const segments = [
      { start: 0, end: 2, speaker: "responder", text: "patient says their hip hurts", confidence: 0.9 },
    ];
    const bytes = new TextEncoder().encode(JSON.stringify(segments));
    const sha256 = sha256Hex(bytes);

    const initRes = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "audio", sha256 }),
    });
    const init = await json<InitAssetResponse>(initRes);

    await app.request(`/assets/${init.assetId}/parts/1`, { method: "PUT", body: bytes });
    await app.request(`/assets/${init.assetId}/complete`, { method: "POST" });

    const noteRes = await app.request(`/assets/${init.assetId}/note`);
    expect(noteRes.status).toBe(200);
    const note = await json<{ captureId: string; sections: { mechanismOrComplaint?: string } }>(noteRes);
    expect(note.captureId).toBe("cap_1");
    expect(note.sections.mechanismOrComplaint).toBe("patient says their hip hurts");
  });

  it("404s on /note for a photo, nothing to transcribe", async () => {
    const app = createApp(new MemoryVaultStore());
    const bytes = new TextEncoder().encode("fake photo bytes");
    const sha256 = sha256Hex(bytes);

    const initRes = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "photo", sha256 }),
    });
    const init = await json<InitAssetResponse>(initRes);

    await app.request(`/assets/${init.assetId}/parts/1`, { method: "PUT", body: bytes });
    await app.request(`/assets/${init.assetId}/complete`, { method: "POST" });

    const noteRes = await app.request(`/assets/${init.assetId}/note`);
    expect(noteRes.status).toBe(404);
  });

  it("downloads a completed asset's raw bytes back out", async () => {
    const app = createApp(new MemoryVaultStore());
    const bytes = new TextEncoder().encode("fake photo bytes to view later");
    const sha256 = sha256Hex(bytes);

    const initRes = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "photo", sha256 }),
    });
    const init = await json<InitAssetResponse>(initRes);

    await app.request(`/assets/${init.assetId}/parts/1`, { method: "PUT", body: bytes });
    await app.request(`/assets/${init.assetId}/complete`, { method: "POST" });

    const downloadRes = await app.request(`/assets/${init.assetId}/download`);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await downloadRes.arrayBuffer())).toEqual(bytes);
  });

  it("captions a completed photo using the fake captioner by default", async () => {
    const app = createApp(new MemoryVaultStore());
    const bytes = new TextEncoder().encode("fake photo bytes");
    const sha256 = sha256Hex(bytes);

    const initRes = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "photo", sha256 }),
    });
    const init = await json<InitAssetResponse>(initRes);

    await app.request(`/assets/${init.assetId}/parts/1`, { method: "PUT", body: bytes });
    await app.request(`/assets/${init.assetId}/complete`, { method: "POST" });

    const captionRes = await app.request(`/assets/${init.assetId}/caption`);
    expect(captionRes.status).toBe(200);
    const body = await json<{ caption: string }>(captionRes);
    expect(body.caption.length).toBeGreaterThan(0);
  });

  it("404s on /caption for an audio asset, nothing to caption", async () => {
    const app = createApp(new MemoryVaultStore());
    const segments = [{ start: 0, end: 1, speaker: "responder", text: "hi", confidence: 0.9 }];
    const bytes = new TextEncoder().encode(JSON.stringify(segments));
    const sha256 = sha256Hex(bytes);

    const initRes = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "audio", sha256 }),
    });
    const init = await json<InitAssetResponse>(initRes);

    await app.request(`/assets/${init.assetId}/parts/1`, { method: "PUT", body: bytes });
    await app.request(`/assets/${init.assetId}/complete`, { method: "POST" });

    const captionRes = await app.request(`/assets/${init.assetId}/caption`);
    expect(captionRes.status).toBe(404);
  });
});

describe("dev live feed", () => {
  it("takes device log lines and pushes them out to listeners", async () => {
    const live = createLiveHub();
    const seen: LiveEvent[] = [];
    live.subscribe((e) => seen.push(e));
    const app = createApp(new MemoryVaultStore(), undefined, undefined, undefined, live);

    const res = await app.request("/dev/logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: "nightingale",
        lines: [{ ts: 1, level: "info", msg: "device nightingale is ON" }],
      }),
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual([
      { type: "log", line: expect.objectContaining({ source: "nightingale", msg: "device nightingale is ON" }) },
    ]);
  });

  it("rejects a malformed log batch", async () => {
    const app = createApp(new MemoryVaultStore());
    const res = await app.request("/dev/logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "x", lines: [{ level: "loud" }] }),
    });
    expect(res.status).toBe(400);
  });

  it("lists a completed audio chunk with its transcript and note under its session", async () => {
    const live = createLiveHub();
    const updates: string[] = [];
    live.subscribe((e) => e.type === "update" && updates.push(e.assetId));
    const app = createApp(new MemoryVaultStore(), undefined, undefined, undefined, live);

    const segments = [{ start: 0, end: 2, speaker: "responder", text: "he fell off a ladder", confidence: 0.9 }];
    const bytes = new TextEncoder().encode(JSON.stringify(segments));
    const init = await json<InitAssetResponse>(
      await app.request("/captures/session_1/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "audio", sha256: sha256Hex(bytes) }),
      }),
    );
    await app.request(`/assets/${init.assetId}/parts/1`, { method: "PUT", body: bytes });
    await app.request(`/assets/${init.assetId}/complete`, { method: "POST" });

    // pings when it lands (processing), when the transcript's ready, when the note is
    expect(updates.filter((id) => id === init.assetId).length).toBeGreaterThanOrEqual(2);

    const sessions = await json<
      { captureId: string; assets: { status: string; transcript: { text: string }[]; note?: unknown }[] }[]
    >(await app.request("/dev/sessions"));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.captureId).toBe("session_1");
    expect(sessions[0]!.assets[0]!.status).toBe("ready");
    expect(sessions[0]!.assets[0]!.transcript[0]!.text).toBe("he fell off a ladder");
    expect(sessions[0]!.assets[0]!.note).toBeDefined();
  });

  it("skips transcribing a silent chunk instead of letting whisper make something up", async () => {
    const live = createLiveHub();
    const app = createApp(new MemoryVaultStore(), undefined, undefined, undefined, live);

    // 1s of 16khz mono 16-bit silence, standard 44 byte wav header
    const samples = 16000;
    const bytes = new Uint8Array(44 + samples * 2);
    const view = new DataView(bytes.buffer);
    const ascii = (offset: number, text: string) =>
      [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
    ascii(0, "RIFF");
    view.setUint32(4, 36 + samples * 2, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ascii(36, "data");
    view.setUint32(40, samples * 2, true);

    const init = await json<InitAssetResponse>(
      await app.request("/captures/session_1/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "audio", sha256: sha256Hex(bytes) }),
      }),
    );
    await app.request(`/assets/${init.assetId}/parts/1`, { method: "PUT", body: bytes });
    const done = await app.request(`/assets/${init.assetId}/complete`, { method: "POST" });
    expect(done.status).toBe(200);

    const sessions = await json<{ assets: { status: string }[] }[]>(await app.request("/dev/sessions"));
    expect(sessions[0]!.assets[0]!.status).toBe("silent");
    expect((await app.request(`/assets/${init.assetId}/note`)).status).toBe(404);
  });
});

// small helpers for the drill tests below
async function uploadAudioChunk(app: ReturnType<typeof createApp>, captureId: string, text: string) {
  const segments = [{ start: 0, end: 2, speaker: "responder", text, confidence: 0.9 }];
  const bytes = new TextEncoder().encode(JSON.stringify(segments));
  const init = await json<InitAssetResponse>(
    await app.request(`/captures/${captureId}/assets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "audio", sha256: sha256Hex(bytes) }),
    }),
  );
  await app.request(`/assets/${init.assetId}/parts/1`, { method: "PUT", body: bytes });
  await app.request(`/assets/${init.assetId}/complete`, { method: "POST" });
  return init.assetId;
}

async function waitFor<T>(fn: () => Promise<T | undefined>, ms = 2000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timed out waiting");
}

interface SessionJson {
  captureId: string;
  dir: string;
  epcr?: { sections: { mechanismOrComplaint?: string } };
  epcrChunks?: number;
  assets: { status: string; file?: string }[];
}

describe("drill sessions", () => {
  it("builds one session-wide epcr from every chunk so far", async () => {
    const app = createApp(new MemoryVaultStore());
    await uploadAudioChunk(app, "session_1", "patient fell off a ladder");
    await uploadAudioChunk(app, "session_1", "says his wrist hurts");

    const session = await waitFor(async () => {
      const all = await json<SessionJson[]>(await app.request("/dev/sessions"));
      return all[0]?.epcrChunks === 2 ? all[0] : undefined;
    });
    // fake condenser echoes the merged transcript, so both chunks should be in it
    expect(session.epcr!.sections.mechanismOrComplaint).toContain("ladder");
    expect(session.epcr!.sections.mechanismOrComplaint).toContain("wrist");
  });

  it("saves each session to its own folder and restores it after a restart", async () => {
    const root = mkdtempSync(join(tmpdir(), "nightingale-drills-"));
    try {
      const app = createApp(new MemoryVaultStore(), undefined, undefined, undefined, undefined, {
        drills: createFsDrillStore(root),
      });
      // a device connecting is enough to start a new test folder
      await app.request("/dev/logs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: "nightingale", sessionId: "session_7", lines: [{ ts: 1, level: "info", msg: "device is ON" }] }),
      });
      await uploadAudioChunk(app, "session_7", "patient is alert");

      const dir = await waitFor(async () => {
        const folders = readdirSync(root);
        const d = folders.find((f) => f.endsWith("session_7"));
        return d && existsSync(join(root, d, "session.json")) && existsSync(join(root, d, "epcr.md")) ? d : undefined;
      });
      // session.json is debounced, give the last write a moment
      await new Promise((r) => setTimeout(r, 400));
      expect(readFileSync(join(root, dir, "transcript.md"), "utf8")).toContain("patient is alert");
      expect(readFileSync(join(root, dir, "console.log"), "utf8")).toContain("device is ON");
      expect(readdirSync(join(root, dir, "audio"))).toHaveLength(1);

      // "restart": a brand new app reading the same folder
      const restarted = createApp(new MemoryVaultStore(), undefined, undefined, undefined, undefined, {
        drills: createFsDrillStore(root),
      });
      const sessions = await json<SessionJson[]>(await restarted.request("/dev/sessions"));
      expect(sessions.map((s) => s.captureId)).toEqual(["session_7"]);
      expect(sessions[0]!.assets[0]!.status).toBe("ready");

      const file = sessions[0]!.assets[0]!.file!;
      const res = await restarted.request(`/dev/files/${dir}/${file}`);
      expect(res.status).toBe(200);
      expect((await restarted.request(`/dev/files/${dir}/..%2F..%2Fetc/passwd`)).status).toBe(404);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// stands in for openai's realtime api: every commit comes back as one utterance
function fakeLiveAsr(words = ["patient", "is", "alert"]): LiveAsrFactory {
  return (events) => {
    let n = 0;
    return {
      append: () => {},
      commit: () => {
        const id = `item_${++n}`;
        let text = "";
        for (const w of words) {
          text += (text ? " " : "") + w;
          events.onDelta(id, text.endsWith(w) && text !== w ? " " + w : w);
        }
        events.onFinal(id, words.join(" "));
      },
      close: () => {},
    };
  };
}

function pcm(seconds: number, amplitude: number) {
  const samples = Int16Array.from({ length: 16000 * seconds }, (_, i) => Math.round(amplitude * Math.sin(i / 3)));
  return new Uint8Array(samples.buffer);
}

describe("live transcription", () => {
  it("streams words out as they come and saves the finished utterance", async () => {
    const live = createLiveHub();
    const events: LiveEvent[] = [];
    live.subscribe((e) => events.push(e));
    const app = createApp(new MemoryVaultStore(), undefined, undefined, undefined, live, { liveAsr: fakeLiveAsr() });

    // 2s quiet, 1s talking, 2s quiet, as one streamed request
    const body = new Blob([pcm(2, 20), pcm(1, 3000), pcm(2, 20)]);
    const res = await app.request("/live/session_9/audio", { method: "POST", body });
    expect(res.status).toBe(200);

    const transcripts = events.filter((e) => e.type === "transcript").map((e) => (e as { transcript: { text: string; final: boolean } }).transcript);
    expect(transcripts.some((t) => !t.final)).toBe(true); // partial words went out live
    expect(transcripts.at(-1)).toMatchObject({ text: "patient is alert", final: true });

    const sessions = await json<{ liveTurns: { text: string }[]; liveCoverage: number[][] }[]>(await app.request("/dev/sessions"));
    expect(sessions[0]!.liveTurns.map((t) => t.text)).toEqual(["patient is alert"]);
    expect(sessions[0]!.liveCoverage).toHaveLength(1);
  });

  it("never transcribes a silent stream", async () => {
    let connected = false;
    const asr: LiveAsrFactory = (e) => {
      connected = true;
      return fakeLiveAsr()(e);
    };
    const app = createApp(new MemoryVaultStore(), undefined, undefined, undefined, undefined, { liveAsr: asr });
    await app.request("/live/session_10/audio", { method: "POST", body: new Blob([pcm(5, 20)]) });
    expect(connected).toBe(false);
  });

  it("refuses the live stream cleanly when there's no live transcription configured", async () => {
    const app = createApp(new MemoryVaultStore());
    const res = await app.request("/live/session_11/audio", { method: "POST", body: new Blob([pcm(1, 20)]) });
    expect(res.status).toBe(503);
  });

  it("labels speakers per chunk and replaces the live lines from that stretch", async () => {
    // a diarizing transcriber: two voices, the second chunk reuses the first chunk's names
    const transcriber = {
      transcribe: async (_audio: Uint8Array, opts?: { knownSpeakers?: { name: string }[] }) => {
        const known = (opts?.knownSpeakers ?? []).map((k) => k.name);
        const a = known[0] ?? "A";
        const b = known[1] ?? "B";
        return {
          provider: "x",
          modelVersion: "x",
          segments: [
            { start: 0, end: 2.5, speaker: a, text: "can you tell me what happened", confidence: 1 },
            { start: 2.6, end: 5, speaker: b, text: "i fell off the ladder", confidence: 1 },
          ],
        };
      },
    };
    const app = createApp(
      new MemoryVaultStore(),
      undefined,
      {
        transcriber,
        diarizer: { flagNonResponder: async (t) => t },
        condenser: { condense: async () => { throw new Error("not needed here"); } },
      },
      undefined,
      undefined,
      { liveAsr: fakeLiveAsr(["can", "you", "tell"]) },
    );
    // live words first (1s loud audio)
    await app.request("/live/session_12/audio", { method: "POST", body: new Blob([pcm(1, 20), pcm(1, 3000), pcm(2, 20)]) });

    // then two 6s chunks covering that time, loud enough to pass the silence gate
    const loudWav = () => {
      const samples = Int16Array.from({ length: 16000 * 6 }, (_, i) => Math.round(3000 * Math.sin(i / 3)));
      const wav = new Uint8Array(44 + samples.byteLength);
      const v = new DataView(wav.buffer);
      [..."RIFF"].forEach((c, i) => v.setUint8(i, c.charCodeAt(0)));
      v.setUint32(4, 36 + samples.byteLength, true);
      [..."WAVEfmt "].forEach((c, i) => v.setUint8(8 + i, c.charCodeAt(0)));
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      [..."data"].forEach((c, i) => v.setUint8(36 + i, c.charCodeAt(0)));
      v.setUint32(40, samples.byteLength, true);
      wav.set(new Uint8Array(samples.buffer), 44);
      return wav;
    };
    for (const offset of [12000, 6000]) {
      const wav = loudWav();
      const deviceNow = Date.now() - 20 * 60 * 1000; // pi clock 20 min behind
      const init = await json<InitAssetResponse>(
        await app.request("/captures/session_12/assets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "audio", sha256: sha256Hex(wav), capturedAt: deviceNow - offset, deviceNow }),
        }),
      );
      await app.request(`/assets/${init.assetId}/parts/1`, { method: "PUT", body: wav });
      await app.request(`/assets/${init.assetId}/complete`, { method: "POST" });
    }

    const sessions = await json<
      { speakers: string[]; assets: { capturedAt: number; transcript: { speaker: string }[] }[] }[]
    >(await app.request("/dev/sessions"));
    const s = sessions[0]!;
    expect(s.speakers).toEqual(["Person 1", "Person 2"]);
    // same two names in both chunks, not Person 3/4 the second time
    for (const a of s.assets) expect(a.transcript.map((t) => t.speaker)).toEqual(["Person 1", "Person 2"]);
    // the pi's clock offset got corrected: chunks land in the last ~15s, not 20 min ago
    for (const a of s.assets) expect(Date.now() - a.capturedAt).toBeLessThan(15000);
  });
});

describe("transcriptEntries", () => {
  it("shows live lines until a labelled chunk covers that stretch, then only the labelled ones", () => {
    const t0 = 1_000_000;
    const session: DrillSession = {
      captureId: "s",
      dir: "d",
      startedAt: t0,
      liveTurns: [
        { id: "1", startedAt: t0 + 1000, endedAt: t0 + 3000, text: "can you tell me what happened" },
        { id: "2", startedAt: t0 + 16000, endedAt: t0 + 18000, text: "not labelled yet" },
      ],
      assets: [
        {
          assetId: "a", captureId: "s", kind: "audio", completedAt: t0 + 15500, capturedAt: t0, durationMs: 15000,
          status: "ready", file: "audio/a.wav",
          transcript: [
            { speaker: "Person 1", text: "can you tell me", at: t0 + 1000 },
            { speaker: "Person 1", text: "what happened", at: t0 + 2000 },
            { speaker: "Person 2", text: "i fell", at: t0 + 4000 },
          ],
        },
      ],
    };
    expect(transcriptEntries(session).map((e) => [e.speaker ?? "live", e.text])).toEqual([
      ["Person 1", "can you tell me what happened"],
      ["Person 2", "i fell"],
      ["live", "not labelled yet"],
    ]);
  });
});

describe("new session button", () => {
  it("splits off a fresh session for everything the device sends from then on, old one untouched", async () => {
    const root = mkdtempSync(join(tmpdir(), "nightingale-split-"));
    try {
      const make = () =>
        createApp(new MemoryVaultStore(), undefined, undefined, undefined, undefined, {
          drills: createFsDrillStore(root),
          liveAsr: fakeLiveAsr(["second", "test"]),
        });
      const app = make();
      await uploadAudioChunk(app, "session_dev", "first test");

      const res = await app.request("/dev/sessions/new", { method: "POST" });
      expect(res.status).toBe(201);
      const fresh = await json<{ captureId: string; deviceSessionId: string }>(res);
      expect(fresh.deviceSessionId).toBe("session_dev");

      // same device session id, but it's after the press: lands in the new session
      await uploadAudioChunk(app, "session_dev", "after the button");
      await app.request("/live/session_dev/audio", { method: "POST", body: new Blob([pcm(1, 20), pcm(1, 3000), pcm(2, 20)]) });

      type S = { captureId: string; assets: { transcript?: { text: string }[] }[]; liveTurns?: { text: string }[] };
      const byId = async (a: ReturnType<typeof createApp>) =>
        Object.fromEntries((await json<S[]>(await a.request("/dev/sessions"))).map((s) => [s.captureId, s]));
      let all = await byId(app);
      expect(all["session_dev"]!.assets.map((a) => a.transcript?.[0]?.text)).toEqual(["first test"]);
      expect(all[fresh.captureId]!.assets.map((a) => a.transcript?.[0]?.text)).toEqual(["after the button"]);
      expect(all[fresh.captureId]!.liveTurns!.map((t) => t.text)).toEqual(["second test"]);
      expect(all["session_dev"]!.liveTurns ?? []).toEqual([]);

      // after an api restart new data from that device still goes to the new session
      await new Promise((r) => setTimeout(r, 400)); // debounced saves
      const restarted = make();
      await uploadAudioChunk(restarted, "session_dev", "after restart");
      all = await byId(restarted);
      expect(all[fresh.captureId]!.assets.map((a) => a.transcript?.[0]?.text)).toContain("after restart");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("still works with no device connected yet", async () => {
    const app = createApp(new MemoryVaultStore());
    const res = await app.request("/dev/sessions/new", { method: "POST" });
    expect(res.status).toBe(201);
    const sessions = await json<{ captureId: string }[]>(await app.request("/dev/sessions"));
    expect(sessions).toHaveLength(1);
  });

  it("pressed before the pi is on: the pi records into that call when it boots, extra presses reuse it", async () => {
    const app = createApp(new MemoryVaultStore());
    const first = await json<{ captureId: string }>(await app.request("/dev/sessions/new", { method: "POST" }));
    const again = await json<{ captureId: string }>(await app.request("/dev/sessions/new", { method: "POST" }));
    expect(again.captureId).toBe(first.captureId);

    // pi boots with its own session id, says hello, then uploads
    await app.request("/dev/logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "nightingale", sessionId: "boot_1", lines: [{ ts: Date.now(), level: "info", msg: "recording" }] }),
    });
    await uploadAudioChunk(app, "boot_1", "on scene");

    type S = { captureId: string; assets: { transcript?: { text: string }[] }[] };
    const all = await json<S[]>(await app.request("/dev/sessions"));
    expect(all.map((x) => x.captureId)).toEqual([first.captureId]);
    expect(all[0]!.assets.map((a) => a.transcript?.[0]?.text)).toEqual(["on scene"]);
  });
});


describe("crash pad (laptop copy before the device deletes its own)", () => {
  // init -> one part (if any) -> complete, the way the pi does it
  async function piUpload(app: ReturnType<typeof createApp>, captureId: string, bytes: Uint8Array, capturedAt?: number, kind = "photo") {
    const init = await json<InitAssetResponse>(
      await app.request(`/captures/${captureId}/assets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, sha256: sha256Hex(bytes), capturedAt }),
      }),
    );
    if (bytes.length) await app.request(`/assets/${init.assetId}/parts/1`, { method: "PUT", body: bytes });
    return app.request(`/assets/${init.assetId}/complete`, { method: "POST" });
  }

  it("saves the exact bytes under the device's own file name, read-only, in the manifest, before saying verified", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crashpad-"));
    const app = createApp(new MemoryVaultStore(), undefined, undefined, undefined, undefined, {
      crashpad: createFsCrashpad(dir),
    });
    const bytes = new TextEncoder().encode("a photo from the field test");
    const res = await piUpload(app, "session_1792500000", bytes, 1792500012345);
    expect(res.status).toBe(200);
    expect((await json<CompleteResponse>(res)).verified).toBe(true);

    const file = join(dir, "session_1792500000", "session_1792500000__1792500012345.jpg");
    expect(Array.from(readFileSync(file))).toEqual(Array.from(bytes));
    expect(statSync(file).mode & 0o222).toBe(0); // nobody can write to it
    expect(readFileSync(join(dir, "manifest.sha256"), "utf8")).toBe(
      `${sha256Hex(bytes)}  session_1792500000/session_1792500000__1792500012345.jpg\n`,
    );

    // the device retrying the same file doesn't make a second copy
    await piUpload(app, "session_1792500000", bytes, 1792500012345);
    expect(readdirSync(join(dir, "session_1792500000"))).toHaveLength(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("tells the device NOT verified if the crash pad copy can't be saved, so it keeps its own", async () => {
    const app = createApp(new MemoryVaultStore(), undefined, undefined, undefined, undefined, {
      crashpad: { save: () => { throw new Error("disk full"); } },
    });
    const res = await piUpload(app, "session_1", new TextEncoder().encode("x"));
    expect(res.status).toBe(500);
  });

  it("accepts an empty file instead of refusing it forever (old pi software jammed on those)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crashpad-"));
    const app = createApp(new MemoryVaultStore(), undefined, undefined, undefined, undefined, {
      crashpad: createFsCrashpad(dir),
    });
    const res = await piUpload(app, "session_2", new Uint8Array(0), 1792500000000, "audio");
    expect(res.status).toBe(200);
    expect((await json<CompleteResponse>(res)).verified).toBe(true);
    expect(statSync(join(dir, "session_2", "session_2__1792500000000.wav")).size).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("answers before processing is done when processing runs in the background", async () => {
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const app = createApp(
      new MemoryVaultStore(),
      undefined,
      undefined,
      { caption: async () => { await slow; return "late"; } },
      undefined,
      { processInBackground: true },
    );
    const res = await piUpload(app, "session_3", new TextEncoder().encode("photo"));
    expect(res.status).toBe(200); // didn't wait for the caption
    release();
  });
});
