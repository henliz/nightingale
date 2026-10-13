import type { Transcript } from "@nightingale/schema";
import { describe, expect, it } from "vitest";
import { FakeCondenser, FakeDiarizer, FakePhotoPass, FakeTranscriber } from "./fake-adapters.js";

const baseTranscript: Transcript = {
  id: "tr_1",
  captureId: "cap_1",
  provider: "fake-transcriber",
  modelVersion: "fake-1",
  segments: [
    { start: 0, end: 2, speaker: "responder", text: "what happened", confidence: 0.9 },
    { start: 2, end: 5, speaker: "patient", text: "I fell on the steps", confidence: 0.9 },
    { start: 5, end: 8, speaker: "bystander", text: "the steps are always wet", confidence: 0.8 },
  ],
};

describe("FakeTranscriber", () => {
  it("decodes json-encoded segments back out, provider stamped as fake", async () => {
    const segments = [{ start: 0, end: 1, speaker: "patient", text: "hi", confidence: 0.9 }];
    const result = await new FakeTranscriber().transcribe(
      new TextEncoder().encode(JSON.stringify(segments)),
    );
    expect(result.provider).toBe("fake-transcriber");
    expect(result.segments).toEqual(segments);
  });
});

describe("FakeDiarizer", () => {
  it("flags every segment whose speaker isn't a known responder voice", async () => {
    const result = await new FakeDiarizer().flagNonResponder(baseTranscript);
    expect(result.segments[0]!.nonResponder).toBeUndefined();
    expect(result.segments[1]!.nonResponder).toBeUndefined();
    expect(result.segments[2]!.nonResponder).toBe(true);
  });

  it("respects a custom known-responder list", async () => {
    const result = await new FakeDiarizer().flagNonResponder(baseTranscript, ["responder"]);
    expect(result.segments[1]!.nonResponder).toBe(true); // patient isn't in the custom list
  });
});

describe("FakeCondenser", () => {
  it("echoes responder + patient narration into mechanismOrComplaint, bystander speech aside", async () => {
    const diarized = await new FakeDiarizer().flagNonResponder(baseTranscript);
    const note = await new FakeCondenser().condense(diarized, {
      captureId: "cap_1",
      modelVersion: "fake-condenser-1",
      promptVersion: "v1",
    });

    expect(note.sections.mechanismOrComplaint).toBe("what happened I fell on the steps");
    expect(note.spans).toContainEqual({
      field: "sections.mechanismOrComplaint",
      transcriptSegmentIds: ["segment[0]", "segment[1]"],
    });
  });

  it("still carries the narration when the patient never speaks (unconscious, etc)", async () => {
    const responderOnly: Transcript = {
      ...baseTranscript,
      segments: [
        { start: 0, end: 3, speaker: "responder", text: "unresponsive, breathing, radial pulse present", confidence: 0.95 },
      ],
    };
    const diarized = await new FakeDiarizer().flagNonResponder(responderOnly);
    const note = await new FakeCondenser().condense(diarized, {
      captureId: "cap_1",
      modelVersion: "fake-condenser-1",
      promptVersion: "v1",
    });

    expect(note.sections.mechanismOrComplaint).toBe("unresponsive, breathing, radial pulse present");
  });

  it("flags bystander speech instead of folding it into the note silently", async () => {
    const diarized = await new FakeDiarizer().flagNonResponder(baseTranscript);
    const note = await new FakeCondenser().condense(diarized, {
      captureId: "cap_1",
      modelVersion: "fake-condenser-1",
      promptVersion: "v1",
    });

    expect(note.sections.bystanderStatements).toBe("the steps are always wet");
    expect(note.flags).toContainEqual({
      type: "non_responder_speech",
      ref: "segment[2]",
      note: "bystander speech, review before approval",
    });
  });

  it("never emits an unsupported_claim flag, it only ever echoes what's in the transcript", async () => {
    const note = await new FakeCondenser().condense(baseTranscript, {
      captureId: "cap_1",
      modelVersion: "fake-condenser-1",
      promptVersion: "v1",
    });
    expect(note.flags.some((f) => f.type === "unsupported_claim")).toBe(false);
  });
});

describe("FakePhotoPass", () => {
  it("passes the image through and reports blurred/unflagged", async () => {
    const image = new Uint8Array([1, 2, 3]);
    const result = await new FakePhotoPass().process(image);
    expect(result.image).toBe(image);
    expect(result.facesBlurred).toBe(true);
    expect(result.healthNumberFlagged).toBe(false);
  });
});
