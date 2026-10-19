import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiDiarizedTranscriber, collectWords, withReferenceClips, wordsToSegments } from "./gemini-adapters.js";

// 16 khz mono 16-bit wav of n seconds at a constant level
function wav(secs: number, level = 2000) {
  const n = Math.round(secs * 16000);
  const out = new Uint8Array(44 + n * 2);
  const v = new DataView(out.buffer);
  out.set(new TextEncoder().encode("RIFF"), 0);
  v.setUint32(4, 36 + n * 2, true);
  out.set(new TextEncoder().encode("WAVEfmt "), 8);
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  out.set(new TextEncoder().encode("data"), 36);
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, i % 2 ? level : -level, true);
  return out;
}

const word = (text: string, speaker: string, start: number, end = start + 0.3) => ({
  type: "word_info", text, speaker, start_offset: `${start}s`, end_offset: `${end}s`,
});

describe("gemini speaker labels", () => {
  it("puts the reference clips in front of the chunk with a gap after each", () => {
    const { wav: joined, regions, offset } = withReferenceClips(wav(15), [
      { name: "Person 1", wav: wav(2) },
      { name: "Person 2", wav: wav(3) },
    ]);
    expect(regions).toEqual([
      { name: "Person 1", start: 0, end: 2 },
      { name: "Person 2", start: 2.8, end: 5.8 },
    ]);
    expect(offset).toBeCloseTo(6.6);
    expect(joined.length).toBe(44 + Math.round((6.6 + 15) * 32000));
  });

  it("maps gemini's labels to the known people and drops the reference words", () => {
    const regions = [
      { name: "Person 1", start: 0, end: 2 },
      { name: "Person 2", start: 2.8, end: 5.8 },
    ];
    // gemini numbered them the other way round this time
    const words = [
      word("ref", "spk_2", 0.2), word("one", "spk_2", 1),
      word("ref", "spk_1", 3), word("two", "spk_1", 4),
      word("where", "spk_2", 7), word("does", "spk_2", 7.4), word("it", "spk_2", 7.6), word("hurt", "spk_2", 7.8), word("?", "spk_2", 8),
      word("my", "spk_1", 9), word("leg", "spk_1", 9.3),
      word("hi", "spk_3", 11),
    ];
    expect(wordsToSegments(words, regions, 6.6)).toEqual([
      { start: expect.closeTo(0.4), end: expect.closeTo(1.7), speaker: "Person 1", text: "where does it hurt?", confidence: 1 },
      { start: expect.closeTo(2.4), end: expect.closeTo(3), speaker: "Person 2", text: "my leg", confidence: 1 },
      { start: expect.closeTo(4.4), end: expect.closeTo(4.7), speaker: "spk_3", text: "hi", confidence: 1 },
    ]);
  });

  it("finds word annotations wherever they sit in the response", () => {
    const body = { steps: [{ content: [{ text: "x", annotations: [word("a", "spk_1", 0), { type: "other" }] }] }] };
    expect(collectWords(body).map((w) => w.text)).toEqual(["a"]);
  });
});

describe("GeminiDiarizedTranscriber", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the joined audio with speaker diarization on and returns labelled lines", async () => {
    const fetchMock = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      const sent = JSON.parse(init.body);
      expect(sent.model).toBe("gemini-3.5-transcribe");
      expect(sent.generation_config.transcription_config.mode.diarization_mode).toBe("speaker");
      expect(init.headers["x-goog-api-key"]).toBe("k");
      return new Response(JSON.stringify({ steps: [{ content: [{ annotations: [word("hello", "spk_1", 0.5)] }] }] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const t = new GeminiDiarizedTranscriber({ apiKey: "k" });
    const out = await t.transcribe(wav(2));
    expect(fetchMock.mock.calls[0]![0]).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(out.segments).toEqual([expect.objectContaining({ speaker: "spk_1", text: "hello" })]);
  });
});
