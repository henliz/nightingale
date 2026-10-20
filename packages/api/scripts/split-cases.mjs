// splits one long drill recording into named cases (oct 19 2026 field test: three scenes
// back to back in one session). works only on copies: reads the source session's
// drills/ folder, writes new case folders next to it. the source session and the crash
// pad are never touched.
//
// for each case:
//   audio/       copies of its chunks, plus case.wav (stitched) and case.mp3 (sent to gemini)
//   photos/      copies of its photos, turned upright (fixed rotation for the camera mount)
//   gemini-transcript.json   gemini's raw answer
//   session.json the dashboard session, named, one speaker numbering for the whole case
//
// usage (from packages/api, after pnpm build):
//   node scripts/split-cases.mjs <cases.json>
// cases.json: { "source": "<drills folder name>", "crashpad": "<crash pad session folder>",
//   "rotateDeg": 270, "cases": [{ "title": "...", "slug": "...", "from": 21, "to": 45 }] }
// from/to are chunk numbers (#000 = the first chunk of the session), inclusive
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const drillsDir = path.join(root, "drills");
const srcDir = path.join(drillsDir, plan.source);
const src = JSON.parse(fs.readFileSync(path.join(srcDir, "session.json"), "utf8"));
const key = fs.readFileSync(path.join(root, ".env"), "utf8").match(/^GEMINI_API_KEY=["']?([^"'\s]+)/m)?.[1];
if (!key) throw new Error("no GEMINI_API_KEY in .env");
const { collectWords, wordsToSegments, wavPcm } = await import("@nightingale/pipeline");
const { sessionDirName } = await import("../dist/drills.js");

const audio = src.assets.filter((a) => a.kind === "audio").sort((a, b) => a.capturedAt - b.capturedAt);
const photos = src.assets.filter((a) => a.kind === "photo");

// the pi's own stamps (from the crash pad file names) are the one clock audio and photos
// share, so photos get placed on the audio timeline with those, not the server's guess
const stampOf = (f, ext) => Number(f.match(new RegExp(`__(\\d+)\\.${ext}$`))?.[1]);
const padFiles = fs.readdirSync(plan.crashpad);
const chunkStamps = padFiles.filter((f) => f.endsWith(".wav")).map((f) => stampOf(f, "wav")).sort((a, b) => a - b);
const photoStamps = padFiles.filter((f) => f.endsWith(".jpg")).map((f) => stampOf(f, "jpg")).sort((a, b) => a - b);
if (chunkStamps.length !== audio.length || photoStamps.length !== photos.length) {
  throw new Error(`crash pad has ${chunkStamps.length} chunks / ${photoStamps.length} photos, session has ${audio.length} / ${photos.length}`);
}
// photos uploaded in their own order, match them to the crash pad by upload order
const photosInOrder = [...photos].sort((a, b) => (a.capturedAt ?? a.completedAt) - (b.capturedAt ?? b.completedAt));
const photoAt = photoStamps.map((stamp, i) => {
  let c = chunkStamps.findLastIndex((s) => s <= stamp);
  if (c < 0) c = 0;
  return { asset: photosInOrder[i], chunk: c, at: audio[c].capturedAt + (stamp - chunkStamps[c]) };
});

for (const [n, c] of plan.cases.entries()) {
  const chunks = audio.slice(c.from, c.to + 1);
  const startedAt = chunks[0].capturedAt;
  const captureId = `case_${n + 1}_${c.slug}`;
  const dir = sessionDirName(captureId, startedAt);
  const out = path.join(drillsDir, dir);
  if (fs.existsSync(out)) throw new Error(`${dir} already exists, not overwriting it`);
  fs.mkdirSync(path.join(out, "audio"), { recursive: true });
  fs.mkdirSync(path.join(out, "photos"), { recursive: true });
  console.log(`\n${c.title}: chunks #${c.from}-#${c.to} (${chunks.length}), -> drills/${dir}`);

  // stitch: one continuous pcm stream, remembering where each chunk starts
  const pcms = [];
  const offsets = [];
  let secs = 0;
  for (const a of chunks) {
    const bytes = fs.readFileSync(path.join(srcDir, a.file));
    fs.copyFileSync(path.join(srcDir, a.file), path.join(out, a.file), fs.constants.COPYFILE_EXCL);
    const { pcm } = wavPcm(new Uint8Array(bytes));
    offsets.push(secs);
    secs += pcm.length / 32000;
    pcms.push(pcm);
  }
  const total = pcms.reduce((t, p) => t + p.length, 0);
  const wav = Buffer.alloc(44 + total);
  fs.readFileSync(path.join(srcDir, chunks[0].file)).copy(wav, 0, 0, 44);
  wav.writeUInt32LE(36 + total, 4);
  wav.writeUInt32LE(total, 40);
  let o = 44;
  for (const p of pcms) Buffer.from(p).copy(wav, o), (o += p.length);
  fs.writeFileSync(path.join(out, "audio/case.wav"), wav);
  // mp3 for gemini (a 6 minute wav is too big to send inline). dynaudnorm evens out
  // voices near and far from the mic, it only changes this copy
  execFileSync("ffmpeg", ["-loglevel", "error", "-i", path.join(out, "audio/case.wav"), "-af", "dynaudnorm", "-ac", "1", "-b:a", "64k", path.join(out, "audio/case.mp3")]);
  console.log(`  ${(secs / 60).toFixed(1)} min stitched, asking gemini for one speaker-labelled transcript...`);

  const t = Date.now();
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      model: "gemini-3.5-transcribe",
      input: [{ type: "audio", data: fs.readFileSync(path.join(out, "audio/case.mp3")).toString("base64"), mime_type: "audio/mp3" }],
      generation_config: {
        transcription_config: {
          language_codes: ["en-US"],
          mode: { type: "verbatim", diarization_mode: "speaker", timestamp_granularities: ["word"] },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`gemini failed for ${c.title}: ${res.status} ${await res.text()}`);
  const body = await res.json();
  fs.writeFileSync(path.join(out, "gemini-transcript.json"), JSON.stringify(body, null, 2));
  const segments = wordsToSegments(collectWords(body), [], 0);

  // gemini's labels -> Person 1, 2, ... in the order they first speak in this case
  const names = new Map();
  for (const s of segments) if (!names.has(s.speaker)) names.set(s.speaker, `Person ${names.size + 1}`);
  console.log(`  ${segments.length} lines, ${names.size} voices, ${((Date.now() - t) / 1000).toFixed(1)}s`);

  // hand each line back to the chunk it started in, so audio + text stay together
  const assets = chunks.map((a, i) => ({
    ...a,
    assetId: crypto.randomUUID(),
    captureId,
    status: "ready",
    note: undefined,
    transcript: segments
      .filter((s) => s.start >= offsets[i] && (i === chunks.length - 1 || s.start < offsets[i + 1]))
      .map((s) => ({ speaker: names.get(s.speaker), text: s.text, at: Math.round(a.capturedAt + (s.start - offsets[i]) * 1000) })),
  }));

  // photos taken while this case's audio was recording, copied and turned upright
  for (const p of photoAt.filter((p) => p.chunk >= c.from && p.chunk <= c.to)) {
    const file = p.asset.file;
    fs.copyFileSync(path.join(srcDir, file), path.join(out, file), fs.constants.COPYFILE_EXCL);
    if (plan.rotateDeg) execFileSync("sips", ["-r", String(plan.rotateDeg), path.join(out, file)], { stdio: "ignore" });
    assets.push({ ...p.asset, assetId: crypto.randomUUID(), captureId, capturedAt: p.at, completedAt: p.at });
    console.log(`  photo ${path.basename(file)} (during chunk #${p.chunk}), turned upright`);
  }

  const session = {
    captureId,
    dir,
    title: c.title,
    caseOf: src.captureId,
    deviceId: src.deviceId,
    startedAt,
    assets,
    speakers: [...names.values()],
  };
  fs.writeFileSync(path.join(out, "session.json"), JSON.stringify(session, null, 2));
}
console.log("\ndone. restart the api (or let it reload) to see the cases, then rebuild each epcr");
