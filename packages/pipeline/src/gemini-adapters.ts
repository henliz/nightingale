import type { RawSegment, TranscribeOptions, TranscribeResult, Transcriber } from "./interfaces.js";
import { normalizeWav, wavPcm } from "./real-adapters.js";

// gemini 3.5 transcribe (oct 19 2026): speaker-labelled transcription of the saved chunks,
// roughly what openai's diarize model costs, and openai's is being removed feb 2027.
//
// gemini can't take "this is what Person 1 sounds like" reference clips the way openai
// does, and without them its spk_1 in one chunk has nothing to do with spk_1 in the next.
// so the reference clips get played in front of the chunk, with a gap after each:
//
//   [Person 1's clip] gap [Person 2's clip] gap [the actual 15s chunk]
//
// whichever label gemini gives a clip's stretch is that person, those words get dropped,
// and the chunk's times get shifted back to start at 0

export const GEMINI_TRANSCRIBE_MODEL_DEFAULT = "gemini-3.5-transcribe";

const GAP_SECONDS = 0.8;

interface WordInfo {
  type?: string;
  text?: string;
  speaker?: string;
  start_offset?: string;
  end_offset?: string;
}

// "1.250s" -> 1.25
const seconds = (offset?: string) => Number.parseFloat(offset ?? "0") || 0;

// every word_info annotation anywhere in the response, in order. walks the whole thing
// instead of trusting one exact nesting, the interactions api is new
export function collectWords(body: unknown): WordInfo[] {
  const words: WordInfo[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.type === "word_info" && typeof o.text === "string") words.push(o as WordInfo);
      else Object.values(o).forEach(walk);
    }
  };
  walk(body);
  return words;
}

/** reference clips + gaps + the chunk, as one 16 khz wav, and where each clip sits */
export function withReferenceClips(chunk: Uint8Array, refs: { name: string; wav: Uint8Array }[]) {
  const main = wavPcm(normalizeWav(chunk));
  if (!main) return { wav: chunk, regions: [] as { name: string; start: number; end: number }[], offset: 0 };
  const bytesPerSec = main.rate * 2;
  const gap = new Uint8Array(Math.round(GAP_SECONDS * main.rate) * 2);
  const parts: Uint8Array[] = [];
  const regions: { name: string; start: number; end: number }[] = [];
  let at = 0;
  for (const ref of refs) {
    const clip = wavPcm(ref.wav);
    if (!clip || clip.rate !== main.rate) continue;
    regions.push({ name: ref.name, start: at / bytesPerSec, end: (at + clip.pcm.length) / bytesPerSec });
    parts.push(clip.pcm, gap);
    at += clip.pcm.length + gap.length;
  }
  parts.push(main.pcm);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const wav = new Uint8Array(44 + total);
  wav.set(chunk.subarray(0, 44)); // same format as the chunk
  const view = new DataView(wav.buffer);
  view.setUint32(4, 36 + total, true);
  view.setUint32(40, total, true);
  let o = 44;
  for (const p of parts) wav.set(p, (o += p.length) - p.length);
  return { wav, regions, offset: at / bytesPerSec };
}

/** words -> segments: back-to-back words from the same voice become one line */
export function wordsToSegments(
  words: WordInfo[],
  regions: { name: string; start: number; end: number }[],
  offset: number,
): RawSegment[] {
  // which gemini label covers each reference clip
  const votes = new Map<string, Map<string, number>>();
  for (const w of words) {
    const t = seconds(w.start_offset);
    const region = regions.find((r) => t >= r.start - 0.1 && t < r.end + GAP_SECONDS / 2);
    if (!region || !w.speaker) continue;
    const byLabel = votes.get(region.name) ?? new Map<string, number>();
    byLabel.set(w.speaker, (byLabel.get(w.speaker) ?? 0) + 1);
    votes.set(region.name, byLabel);
  }
  const labelToName = new Map<string, { name: string; count: number }>();
  for (const [name, byLabel] of votes) {
    const [label, count] = [...byLabel].sort((a, b) => b[1] - a[1])[0]!;
    const taken = labelToName.get(label);
    if (!taken || count > taken.count) labelToName.set(label, { name, count });
  }

  const segments: RawSegment[] = [];
  for (const w of words) {
    const start = seconds(w.start_offset) - offset;
    if (start < -0.05) continue; // part of a reference clip, not this chunk
    const speaker = (w.speaker && labelToName.get(w.speaker)?.name) ?? w.speaker ?? "unknown";
    const end = Math.max(start, seconds(w.end_offset) - offset);
    const text = (w.text ?? "").trim();
    if (!text) continue;
    const last = segments.at(-1);
    if (last && last.speaker === speaker) {
      last.text += /^[.,!?;:]/.test(text) ? text : ` ${text}`;
      last.end = end;
    } else {
      segments.push({ start: Math.max(0, start), end, speaker, text, confidence: 1 });
    }
  }
  return segments;
}

export class GeminiDiarizedTranscriber implements Transcriber {
  private model: string;
  private baseUrl: string;

  constructor(private readonly config: { apiKey: string; model?: string; baseUrl?: string }) {
    this.model = config.model ?? GEMINI_TRANSCRIBE_MODEL_DEFAULT;
    this.baseUrl = config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
  }

  async transcribe(audio: Uint8Array, opts?: TranscribeOptions): Promise<TranscribeResult> {
    const refs = (opts?.knownSpeakers ?? []).slice(0, 4).flatMap((k) => {
      const b64 = k.reference.split(",")[1];
      return b64 ? [{ name: k.name, wav: new Uint8Array(Buffer.from(b64, "base64")) }] : [];
    });
    const { wav, regions, offset } = withReferenceClips(audio, refs);

    const res = await fetch(`${this.baseUrl}/interactions`, {
      method: "POST",
      headers: { "x-goog-api-key": this.config.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        input: [{ type: "audio", data: Buffer.from(wav).toString("base64"), mime_type: "audio/wav" }],
        generation_config: {
          // no custom vocabulary: gemini can't combine it with speaker labels, and a vocab
          // prompt is what made openai invent radio calls
          transcription_config: {
            language_codes: ["en-US"],
            // speaker labels only come back as per-word annotations, so word timestamps are needed too
            mode: { type: "verbatim", diarization_mode: "speaker", timestamp_granularities: ["word"] },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`gemini diarized transcription failed: ${res.status} ${await res.text()}`);

    const segments = wordsToSegments(collectWords(await res.json()), regions, offset);
    return { provider: "gemini", modelVersion: this.model, segments };
  }
}
