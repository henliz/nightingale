import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boostWavGain,
  OpenAICondenser,
  OpenAITranscriber,
  wavLoudestSecondDbfs,
} from "./real-adapters.js";

// builds a minimal valid pcm16 mono wav, no extra chunks, so tests don't need a real
// audio file on disk just to exercise the gain math
function buildTestWav(samples: number[]): Uint8Array {
  const dataSize = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // pcm
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 16000, true); // sample rate
  view.setUint32(28, 32000, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  samples.forEach((s, i) => view.setInt16(44 + i * 2, s, true));
  return bytes;
}

function readSamples(wav: Uint8Array, count: number): number[] {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(view.getInt16(44 + i * 2, true));
  return out;
}

describe("boostWavGain", () => {
  it("leaves samples unchanged at 0db", () => {
    const wav = buildTestWav([100, -200, 5000]);
    const boosted = boostWavGain(wav, 0);
    expect(readSamples(boosted, 3)).toEqual([100, -200, 5000]);
  });

  it("roughly triples amplitude at +9.5db (about x3)", () => {
    const wav = buildTestWav([1000, -1000]);
    const boosted = boostWavGain(wav, 9.54);
    const [a, b] = readSamples(boosted, 2);
    expect(a).toBeGreaterThan(2900);
    expect(a).toBeLessThan(3100);
    expect(b).toBeLessThan(-2900);
    expect(b).toBeGreaterThan(-3100);
  });

  it("clamps at int16 bounds instead of wrapping around", () => {
    const wav = buildTestWav([30000, -30000]);
    const boosted = boostWavGain(wav, 20); // x10, would overflow without clamping
    const [a, b] = readSamples(boosted, 2);
    expect(a).toBe(32767);
    expect(b).toBe(-32768);
  });

  it("never mutates the buffer it was given", () => {
    const wav = buildTestWav([1000]);
    const original = readSamples(wav, 1)[0];
    boostWavGain(wav, 20);
    expect(readSamples(wav, 1)[0]).toBe(original);
  });

  it("survives a header that claims more audio than the file has (cut-off recording)", () => {
    const wav = buildTestWav([1000, 1000]);
    new DataView(wav.buffer).setUint32(40, 0x7fffffff, true); // arecord-style placeholder size
    expect(readSamples(boostWavGain(wav, 6), 2)[0]).toBeGreaterThan(1900);
  });

  it("returns the input unchanged if there's no recognizable data chunk", () => {
    const notAWav = new TextEncoder().encode("definitely not a wav file");
    expect(boostWavGain(notAWav, 20)).toBe(notAWav);
  });
});

describe("wavLoudestSecondDbfs", () => {
  it("reads full-scale as about 0 dBFS and silence as very quiet", () => {
    expect(wavLoudestSecondDbfs(buildTestWav(new Array(16000).fill(32767)))!).toBeGreaterThan(-0.1);
    expect(wavLoudestSecondDbfs(buildTestWav(new Array(16000).fill(0)))!).toBeLessThan(-80);
  });

  it("returns null for something that isn't a wav", () => {
    expect(wavLoudestSecondDbfs(new TextEncoder().encode("nope"))).toBeNull();
  });
});

// fake fetch, so these never touch the network
function mockFetchOnce(body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("OpenAITranscriber", () => {
  it("forces english, sends NO prompt by default, and splits gpt-4o plain text into sentences", async () => {
    const calls = mockFetchOnce({ text: "Patient is alert. BP 140 over 90!" });
    const result = await new OpenAITranscriber({ apiKey: "k" }).transcribe(buildTestWav([0, 0]));

    const form = calls[0]!.init.body as FormData;
    expect(form.get("model")).toBe("gpt-4o-transcribe");
    expect(form.get("language")).toBe("en");
    // a default vocab prompt made the model invent radio calls out of silence
    expect(form.get("prompt")).toBeNull();
    expect(result.segments.map((s) => s.text)).toEqual(["Patient is alert.", "BP 140 over 90!"]);
  });

  it("drops a segment that just parrots the vocab prompt back", async () => {
    mockFetchOnce({ text: "Hamilton General, St. Joseph's, Juravinski. He says his arm hurts." });
    const result = await new OpenAITranscriber({ apiKey: "k" }).transcribe(buildTestWav([0, 0]), {
      vocab: ["Hamilton General", "St. Joseph's", "Juravinski"],
    });
    expect(result.segments.map((s) => s.text)).toEqual(["He says his arm hurts."]);
  });
});

describe("OpenAICondenser", () => {
  it("fills epcr fields, drops empty ones, and drops a malformed field without losing the rest", async () => {
    mockFetchOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              chiefComplaint: "chest pain",
              vitals: [{ time: "18:40", bp: "140/90", hr: "" }],
              interventions: [{ time: "", intervention: "gave ASA 162 mg", response: "" }],
              sample: { allergies: ["penicillin"], medications: [] },
              transport: "this should be an object",
              hazards: "",
            }),
          },
        },
      ],
    });
    const note = await new OpenAICondenser({ apiKey: "k" }).condense(
      {
        id: "t1",
        captureId: "c1",
        provider: "test",
        modelVersion: "test",
        segments: [{ start: 0, end: 1, speaker: "responder", text: "chest pain", confidence: 1 }],
      },
      { captureId: "c1", modelVersion: "m", promptVersion: "p" },
    );

    expect(note.sections.chiefComplaint).toBe("chest pain");
    expect(note.sections.vitals).toEqual([{ time: "18:40", bp: "140/90" }]);
    expect(note.sections.interventions).toEqual([{ intervention: "gave ASA 162 mg" }]);
    expect(note.sections.sample).toEqual({ allergies: ["penicillin"] });
    expect(note.sections.hazards).toBeUndefined();
    expect(note.sections.transport).toBeUndefined();
    expect(note.flags.some((f) => f.ref === "sections.transport")).toBe(true);
  });
});
