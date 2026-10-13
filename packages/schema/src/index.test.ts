import { describe, expect, it } from "vitest";
import { AuditEvent, Capture, DraftNote, Incident, Org } from "./index.js";

describe("schema", () => {
  it("accepts a minimal valid Org", () => {
    expect(() =>
      Org.parse({ id: "org_1", type: "fire", name: "Woolwich Fire", retentionDays: 365 }),
    ).not.toThrow();
  });

  it("rejects an Org with an unknown type", () => {
    expect(() =>
      Org.parse({ id: "org_1", type: "ambulance", name: "x", retentionDays: 1 }),
    ).toThrow();
  });

  it("requires destinationConfirmed on Incident", () => {
    expect(() =>
      Incident.parse({ id: "inc_1", createdAt: new Date().toISOString(), orgsInvolved: [] }),
    ).toThrow();
  });

  it("accepts a Capture with no assets yet", () => {
    const result = Capture.safeParse({
      id: "cap_1",
      incidentId: "inc_1",
      orgId: "org_1",
      responderId: "resp_1",
      mode: "wearable",
      startedAt: new Date().toISOString(),
      assets: [],
      status: "uploading",
    });
    expect(result.success).toBe(true);
  });

  it("requires every DraftNote flag to use a known type", () => {
    const result = DraftNote.safeParse({
      id: "note_1",
      captureId: "cap_1",
      modelVersion: "fake-1",
      promptVersion: "v1",
      sections: {},
      spans: [],
      flags: [{ type: "made_up_flag", ref: "x" }],
    });
    expect(result.success).toBe(false);
  });

  it("validates an AuditEvent hash chain shape", () => {
    const result = AuditEvent.safeParse({
      id: "audit_1",
      ts: new Date().toISOString(),
      actorId: "user_1",
      actorRole: "fire_responder",
      action: "view",
      recordType: "Capture",
      recordId: "cap_1",
      prevHash: "0".repeat(64),
      hash: "1".repeat(64),
    });
    expect(result.success).toBe(true);
  });
});
