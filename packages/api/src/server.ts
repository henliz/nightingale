import { serve } from "@hono/node-server";
import {
  FakeCondenser,
  FakeDiarizer,
  FakePhotoCaptioner,
  FakeTranscriber,
  OpenAICondenser,
  OpenAIDiarizedTranscriber,
  OpenAIPhotoCaptioner,
  OpenAITranscriber,
  type PhotoCaptioner,
  type PipelineDeps,
} from "@nightingale/pipeline";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createFsDrillStore } from "./drills.js";
import { openAiLiveAsr } from "./live-transcribe.js";
import { createLiveHub } from "./live.js";
import { S3VaultStore } from "./vault.js";

// local dev entrypoint, talks to the vault from docker-compose.yml at the repo root
const vault = new S3VaultStore({
  endpoint: process.env.VAULT_ENDPOINT ?? "http://localhost:9000",
  bucket: process.env.VAULT_BUCKET ?? "nightingale-vault",
  accessKeyId: process.env.VAULT_ACCESS_KEY ?? "nightingale",
  secretAccessKey: process.env.VAULT_SECRET_KEY ?? "nightingale-dev",
});

const apiKey = process.env.OPENAI_API_KEY;

// real transcription + condensing + captioning if a key's set, otherwise fake
// adapters so this still runs with zero setup. diarizer stays fake either way,
// see @nightingale/pipeline's README for what that means
const pipelineDeps: PipelineDeps = {
  // saved chunks get speaker-labelled transcription (Person 1, 2, ...), the live stream
  // covers the word-by-word part. NIGHTINGALE_TRANSCRIBE_MODEL=gpt-4o-transcribe swaps
  // back to plain, unlabelled transcription
  transcriber: !apiKey
    ? new FakeTranscriber()
    : process.env.NIGHTINGALE_TRANSCRIBE_MODEL && !process.env.NIGHTINGALE_TRANSCRIBE_MODEL.includes("diarize")
      ? new OpenAITranscriber({ apiKey, model: process.env.NIGHTINGALE_TRANSCRIBE_MODEL })
      : new OpenAIDiarizedTranscriber({ apiKey, model: process.env.NIGHTINGALE_TRANSCRIBE_MODEL }),
  // with real speaker labels there's no "responder" label to check against yet, so the
  // fake non-responder flagging would flag every voice. pass through until a real
  // responder-voice check exists (ARCHITECTURE.md section 8)
  diarizer: apiKey ? { flagNonResponder: async (t) => t } : new FakeDiarizer(),
  condenser: apiKey ? new OpenAICondenser({ apiKey, model: process.env.NIGHTINGALE_CONDENSE_MODEL }) : new FakeCondenser(),
};

const captioner: PhotoCaptioner = apiKey
  ? new OpenAIPhotoCaptioner({ apiKey })
  : new FakePhotoCaptioner();

if (!apiKey) {
  console.log("no OPENAI_API_KEY set, falling back to fake transcriber/condenser/captioner");
}

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
const liveAsr = apiKey ? openAiLiveAsr(apiKey, process.env.NIGHTINGALE_LIVE_MODEL) : undefined;
const app = createApp(vault, undefined, pipelineDeps, captioner, live, { silenceDbfs, drills, liveAsr });
const port = Number(process.env.PORT ?? 8787);

await vault.ensureBucket();

serve({ fetch: app.fetch, port }, (info) => {
  live.log("server", "info", `api is ON, listening on :${info.port}, dashboard at http://localhost:${info.port}, saving drills to ${drillsDir}`);
});
