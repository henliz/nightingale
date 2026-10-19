// checks the gemini setup against the real api with saved drill audio, before a drill
// depends on it. run from packages/api after building: node scripts/probe-gemini.mjs
// reads GEMINI_API_KEY from the repo's .env. costs a couple of cents
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const env = fs.readFileSync(path.join(root, ".env"), "utf8");
const key = env.match(/^GEMINI_API_KEY=["']?([^"'\s]+)/m)?.[1];
if (!key) {
  console.log("no GEMINI_API_KEY in .env yet");
  process.exit(1);
}

const { geminiLiveAsr, LiveStream } = await import("../dist/live-transcribe.js");
const { GeminiDiarizedTranscriber, OpenAICondenser, wavSlice } = await import("@nightingale/pipeline");

// the saved session with the most real speech in it
const drills = path.join(root, "drills");
const session = process.argv[2] ?? "2026-10-17_19-50-55_session_1792281055";
const audioDir = path.join(drills, session, "audio");
const chunks = fs.readdirSync(audioDir).filter((f) => f.endsWith(".wav")).sort();
const pick = chunks.slice(6, 10); // ~1 minute
console.log(`session ${session}, using ${pick.length} chunks`);

// 1. speaker labels on two chunks in a row, the second one with the first one's voices
// as reference clips, the way the server does it, so Person 1 should stay Person 1
console.log("\n--- speaker labels (gemini-3.5-transcribe) ---");
const transcriber = new GeminiDiarizedTranscriber({ apiKey: key });
const known = [];
for (const f of pick.slice(0, 2)) {
  const chunk = new Uint8Array(fs.readFileSync(path.join(audioDir, f)));
  const t = Date.now();
  try {
    const out = await transcriber.transcribe(chunk, { knownSpeakers: known });
    console.log(`  ${f} (${known.length} reference clip(s) sent along):`);
    for (const s of out.segments) console.log(`    ${s.start.toFixed(1)}s ${s.speaker}: ${s.text}`);
    console.log(`    ${out.segments.length} lines in ${((Date.now() - t) / 1000).toFixed(1)}s`);
    // new voices become Person N with a clip of their longest line
    for (const s of out.segments) {
      if (s.speaker.startsWith("Person") || known.some((k) => k.raw === s.speaker)) continue;
      const clip = wavSlice(chunk, s.start, Math.min(s.start + 10, Math.max(s.end, s.start + 2)));
      if (!clip) continue;
      const name = `Person ${known.length + 1}`;
      known.push({ name, raw: s.speaker, reference: `data:audio/wav;base64,${Buffer.from(clip).toString("base64")}` });
      console.log(`    -> ${s.speaker} is now ${name}`);
    }
  } catch (e) {
    console.log("  FAILED:", e.message.slice(0, 600));
  }
}

// 2. live, word by word, fed in real time like the pi does
console.log("\n--- live (gemini-3.5-transcribe-live), real time ---");
const lines = [];
const stream = new LiveStream(geminiLiveAsr(key), {
  onPartial: (_id, text) => process.stdout.write(`\r  ... ${text.slice(-90).padEnd(90)}`),
  onFinal: (_id, text) => {
    lines.push(text);
    process.stdout.write(`\r  ✓ ${text}\n`);
  },
  onError: (m) => console.log("\n  ERROR:", m),
});
for (const f of pick) {
  const b = fs.readFileSync(path.join(audioDir, f));
  for (let i = 44; i + 3200 <= b.length; i += 3200) {
    stream.feed(new Uint8Array(b.subarray(i, i + 3200)));
    await new Promise((r) => setTimeout(r, 100));
  }
}
stream.end();
await new Promise((r) => setTimeout(r, 9000));
console.log(`  ${lines.length} final lines`);

// 3. epcr on gemini's openai-compatible endpoint
console.log("\n--- epcr (gemini-2.5-flash) ---");
const condenser = new OpenAICondenser({
  apiKey: key,
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  model: "gemini-2.5-flash",
  reasoningEffort: "none",
});
const t2 = Date.now();
const note = await condenser.condense(
  { id: "p", captureId: "p", provider: "p", modelVersion: "p", segments: lines.map((text, i) => ({ start: i, end: i + 1, speaker: "unlabelled", text, confidence: 1 })) },
  { captureId: "p", modelVersion: "p", promptVersion: "p" },
);
console.log(`  ${Object.keys(note.sections).length} sections filled in ${((Date.now() - t2) / 1000).toFixed(1)}s`);
console.log("  flags:", note.flags.map((f) => f.note));
process.exit(0);
