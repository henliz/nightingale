import { scenarios } from "@nightingale/fixtures";
import { describe, expect, it } from "vitest";
import { factRecallScore } from "./eval.js";
import { FakeCondenser, FakeDiarizer, FakeTranscriber } from "./fake-adapters.js";
import { runPipeline } from "./pipeline.js";

describe("pipeline, audio to draft note, fake adapters end to end", () => {
  it.each(scenarios)("$slug: produces a valid draft note with a decent fact recall score", async (scenario) => {
    // fixtures store the *final* diarized transcript (nonResponder already flagged).
    // strip that back off to simulate what a raw transcriber would have handed us,
    // so the diarizer in this pipeline is the one doing the flagging, not the fixture
    const rawSegments = scenario.transcript.segments.map(({ nonResponder: _nonResponder, ...rest }) => rest);
    const audio = new TextEncoder().encode(JSON.stringify(rawSegments));

    const { transcript, draftNote } = await runPipeline(
      { transcriber: new FakeTranscriber(), diarizer: new FakeDiarizer(), condenser: new FakeCondenser() },
      {
        captureId: scenario.capture.id,
        audio,
        modelVersion: "fake-condenser-1",
        promptVersion: "v1",
      },
    );

    expect(draftNote.captureId).toBe(scenario.capture.id);

    // the diarizer should land on the same non-responder segments the fixture already
    // knows about, since it's working off the same speaker labels
    const expectedNonResponder = scenario.transcript.segments.map((s) => Boolean(s.nonResponder));
    const actualNonResponder = transcript.segments.map((s) => Boolean(s.nonResponder));
    expect(actualNonResponder).toEqual(expectedNonResponder);

    // every non-responder segment should produce a flag, nothing should slip through
    const nonResponderCount = expectedNonResponder.filter(Boolean).length;
    const flagCount = draftNote.flags.filter((f) => f.type === "non_responder_speech").length;
    expect(flagCount).toBe(nonResponderCount);

    const recall = factRecallScore(draftNote, scenario.plantedFacts);
    expect(recall.score).toBeGreaterThanOrEqual(0.5);
  });
});
