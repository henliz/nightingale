import { serve } from "@hono/node-server";
import {
  FakeCondenser,
  FakeDiarizer,
  FakePhotoCaptioner,
  FakeTranscriber,
  GeminiDiarizedTranscriber,
  OpenAICondenser,
  OpenAIDiarizedTranscriber,
  OpenAIPhotoCaptioner,
  OpenAITranscriber,
  type PhotoCaptioner,
  type PipelineDeps,
} from "@nightingale/pipeline";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createFsCrashpad } from "./crashpad.js";
import { createFsDrillStore } from "./drills.js";
import { geminiLiveAsr, openAiLiveAsr } from "./live-transcribe.js";
import { createLiveHub } from "./live.js";
import { S3VaultStore } from "./vault.js";

// epcr + photo captions on gemini: a fast flash model with thinking kept low, same
// reasoning as luna on openai (speed matters more than depth for a live form)
const GEMINI_CHAT_MODEL = "gemini-2.5-flash";
const GEMINI_CHAT_EFFORT = "none";

// local dev entrypoint, talks to the vault from docker-compose.yml at the repo root
const vault = new S3VaultStore({
  endpoint: process.env.VAULT_ENDPOINT ?? "http://localhost:9000",
  bucket: process.env.VAULT_BUCKET ?? "nightingale-vault",
  accessKeyId: process.env.VAULT_ACCESS_KEY ?? "nightingale",
  secretAccessKey: process.env.VAULT_SECRET_KEY ?? "nightingale-dev",
});

const apiKey = process.env.OPENAI_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY;
// gemini whenever its key is set (about half the cost, oct 19 2026), openai otherwise.
// NIGHTINGALE_PROVIDER=openai forces openai even with both keys
const useGemini = !!geminiKey && process.env.NIGHTINGALE_PROVIDER !== "openai";
const anyKey = useGemini || !!apiKey;
// gemini speaks the openai chat format too, so the epcr + photo caption code is shared
const chat = useGemini
  ? { apiKey: geminiKey!, baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" }
  : apiKey
    ? { apiKey }
    : undefined;

// real transcription + condensing + captioning if a key's set, otherwise fake
// adapters so this still runs with zero setup
const pipelineDeps: PipelineDeps = {
  // saved chunks get speaker-labelled transcription (Person 1, 2, ...), the live stream
  // covers the word-by-word part. NIGHTINGALE_TRANSCRIBE_MODEL=gpt-4o-transcribe swaps
  // openai back to plain, unlabelled transcription
  transcriber: useGemini
    ? new GeminiDiarizedTranscriber({ apiKey: geminiKey!, model: process.env.NIGHTINGALE_TRANSCRIBE_MODEL })
    : !apiKey
      ? new FakeTranscriber()
      : process.env.NIGHTINGALE_TRANSCRIBE_MODEL && !process.env.NIGHTINGALE_TRANSCRIBE_MODEL.includes("diarize")
        ? new OpenAITranscriber({ apiKey, model: process.env.NIGHTINGALE_TRANSCRIBE_MODEL })
        : new OpenAIDiarizedTranscriber({ apiKey, model: process.env.NIGHTINGALE_TRANSCRIBE_MODEL }),
  // with real speaker labels there's no "responder" label to check against yet, so the
  // fake non-responder flagging would flag every voice. pass through until a real
  // responder-voice check exists (ARCHITECTURE.md section 8)
  diarizer: anyKey ? { flagNonResponder: async (t) => t } : new FakeDiarizer(),
  condenser: chat
    ? new OpenAICondenser({
        ...chat,
        model: process.env.NIGHTINGALE_CONDENSE_MODEL ?? (useGemini ? GEMINI_CHAT_MODEL : undefined),
        reasoningEffort: process.env.NIGHTINGALE_CONDENSE_EFFORT ?? (useGemini ? GEMINI_CHAT_EFFORT : undefined),
      })
    : new FakeCondenser(),
};

const captioner: PhotoCaptioner = chat
  ? new OpenAIPhotoCaptioner({ ...chat, model: useGemini ? GEMINI_CHAT_MODEL : undefined })
  : new FakePhotoCaptioner();

console.log(
  useGemini
    ? "using gemini for live words, speaker labels, the epcr and photo captions"
    : apiKey
      ? "using openai for live words, speaker labels, the epcr and photo captions"
      : "no GEMINI_API_KEY or OPENAI_API_KEY set, falling back to fake transcriber/condenser/captioner",
);

// echo: live feed lines also print in this terminal, not just on the dashboard
const live = createLiveHub({ echo: true });
const silenceDbfs = process.env.NIGHTINGALE_SILENCE_DBFS
  ? Number(process.env.NIGHTINGALE_SILENCE_DBFS)
  : undefined;
// every drill session gets saved under <repo>/drills/ (or NIGHTINGALE_DRILLS_DIR) and
// reloaded on start, so restarting this doesn't wipe the dashboard
const drillsDir = process.env.NIGHTINGALE_DRILLS_DIR ?? fileURLToPath(new URL("../../../drills/", import.meta.url));
const drills = createFsDrillStore(drillsDir);
// word-by-word transcription of the pi's live audio stream (NIGHTINGALE_LIVE_MODEL to swap)
const liveAsr = useGemini
  ? geminiLiveAsr(geminiKey!, process.env.NIGHTINGALE_LIVE_MODEL)
  : apiKey
    ? openAiLiveAsr(apiKey, process.env.NIGHTINGALE_LIVE_MODEL)
    : undefined;
// every upload lands here byte for byte before the device is told it can delete its
// copy (crashpad.ts). outside the repo so nothing in it ever gets committed
const crashpadDir = process.env.NIGHTINGALE_CRASHPAD_DIR ?? path.join(os.homedir(), "nightingale-crashpad", "from-pi");
const crashpad = createFsCrashpad(crashpadDir);
const app = createApp(vault, undefined, pipelineDeps, captioner, live, {
  silenceDbfs,
  drills,
  liveAsr,
  crashpad,
  processInBackground: true,
  // rebuilding a finished case's epcr: 3.8-flash got the field test's who's-who right
  // (patient vs bystander names, intoxication, no guessed leg) where 2.5-flash didn't
  reviewCondenser: chat
    ? new OpenAICondenser({ ...chat, model: process.env.NIGHTINGALE_REVIEW_MODEL ?? (useGemini ? "gemini-3.8-flash" : undefined) })
    : undefined,
});
const port = Number(process.env.PORT ?? 8787);

await vault.ensureBucket();

serve({ fetch: app.fetch, port }, (info) => {
  live.log("server", "info", `api is ON, listening on :${info.port}, dashboard at http://localhost:${info.port}, saving drills to ${drillsDir}, crash pad at ${crashpadDir}`);
});
