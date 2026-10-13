import type { DraftNote } from "@nightingale/schema";
import { describe, expect, it } from "vitest";
import { factRecallScore } from "./eval.js";

function note(sections: DraftNote["sections"]): DraftNote {
  return {
    id: "note_1",
    captureId: "cap_1",
    modelVersion: "fake-1",
    promptVersion: "v1",
    sections,
    spans: [],
    flags: [],
  };
}

describe("factRecallScore", () => {
  it("recalls a fact whose distinctive words show up in the note", () => {
    const result = factRecallScore(note({ medsAndAllergiesMentioned: ["apixaban"] }), [
      "Medication mentioned: apixaban (blood thinner)",
    ]);
    expect(result.recalled).toEqual(["Medication mentioned: apixaban (blood thinner)"]);
    expect(result.score).toBe(1);
  });

  it("misses a fact that never shows up anywhere", () => {
    const result = factRecallScore(note({ mechanismOrComplaint: "fell on the steps" }), [
      "Allergy mentioned: penicillin",
    ]);
    expect(result.missed).toEqual(["Allergy mentioned: penicillin"]);
    expect(result.score).toBe(0);
  });

  it("scores a mix of recalled and missed facts", () => {
    const result = factRecallScore(note({ hazards: "wet steps, no handrail" }), [
      "Hazard: wet steps, no handrail",
      "Allergy mentioned: penicillin",
    ]);
    expect(result.score).toBe(0.5);
  });

  it("treats an empty planted-facts list as perfect recall", () => {
    expect(factRecallScore(note({}), []).score).toBe(1);
  });
});
