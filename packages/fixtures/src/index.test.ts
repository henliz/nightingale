import { describe, expect, it } from "vitest";
import {
  Asset,
  Capture,
  DraftNote,
  Incident,
  Org,
  Transcript,
} from "@nightingale/schema";
import { scenarios } from "./index.js";

describe("fixtures", () => {
  it("ships exactly two scenarios", () => {
    expect(scenarios).toHaveLength(2);
  });

  it.each(scenarios)("$slug validates against every schema it touches", (scenario) => {
    for (const org of scenario.orgs) {
      expect(Org.safeParse(org).success).toBe(true);
    }
    expect(Incident.safeParse(scenario.incident).success).toBe(true);
    expect(Capture.safeParse(scenario.capture).success).toBe(true);
    for (const asset of scenario.capture.assets) {
      expect(Asset.safeParse(asset).success).toBe(true);
    }
    expect(Transcript.safeParse(scenario.transcript).success).toBe(true);
    expect(DraftNote.safeParse(scenario.draftNote).success).toBe(true);
  });

  it.each(scenarios)("$slug plants at least 8 facts for the recall harness", (scenario) => {
    expect(scenario.plantedFacts.length).toBeGreaterThanOrEqual(8);
  });

  it.each(scenarios)("$slug flags every non-responder transcript segment", (scenario) => {
    const hasNonResponderSegment = scenario.transcript.segments.some((s) => s.nonResponder);
    const hasNonResponderFlag = scenario.draftNote.flags.some((f) => f.type === "non_responder_speech");
    expect(hasNonResponderSegment).toBe(true);
    expect(hasNonResponderFlag).toBe(true);
  });

  it("mva-single-vehicle keeps the ED gate closed (destinationConfirmed is false)", () => {
    const mva = scenarios.find((s) => s.slug === "mva-single-vehicle")!;
    expect(mva.incident.destinationConfirmed).toBe(false);
  });
});
