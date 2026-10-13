import type { Scenario } from "../scenario.js";

/**
 * fictional scenario, scripted for drills and tests only, no real patient info ever
 *
 * single vehicle collision, patient's unconscious (incapable), care proceeds and the note
 * carries capacity/decision maker fields per ARCHITECTURE.md section 2. destination isn't
 * confirmed yet at capture time, which exercises the ED access tier rule (section 7):
 * ED sees nothing until destinationConfirmed is true and the hospital id matches
 */
export const mvaSingleVehicle: Scenario = {
  slug: "mva-single-vehicle",
  description:
    "Fictional single-vehicle collision, patient unconscious/incapable, decision-maker and hazard fields exercised.",
  orgs: [
    { id: "org_cambridge_fire", type: "fire", name: "Cambridge Fire (fictional)", retentionDays: 365 },
    { id: "org_region_ems", type: "paramedic", name: "Region Paramedic Service (fictional)", retentionDays: 2555 },
    { id: "org_st_marys_ed", type: "hospital", name: "St. Mary's ED (fictional)", retentionDays: 3650 },
  ],
  incident: {
    id: "inc_mva_002",
    createdAt: "2026-09-20T22:41:00-04:00",
    orgsInvolved: ["org_cambridge_fire", "org_region_ems"],
    // destination not decided yet at capture time, this is what exercises the ED gate
    destinationConfirmed: false,
  },
  capture: {
    id: "cap_mva_002",
    incidentId: "inc_mva_002",
    orgId: "org_cambridge_fire",
    responderId: "resp_fictional_gallagher",
    deviceId: "device_drill_02",
    mode: "app",
    startedAt: "2026-09-20T22:44:30-04:00",
    durationSec: 61,
    assets: [
      {
        id: "asset_mva_002_audio",
        captureId: "cap_mva_002",
        kind: "audio",
        vaultKey: "vault/mva-single-vehicle/audio-001.wav",
        sha256: "c".repeat(64),
        capturedAt: "2026-09-20T22:44:30-04:00",
      },
      {
        id: "asset_mva_002_photo",
        captureId: "cap_mva_002",
        kind: "photo",
        vaultKey: "vault/mva-single-vehicle/photo-001.jpg",
        sha256: "d".repeat(64),
        capturedAt: "2026-09-20T22:46:00-04:00",
        photoPurpose: "fire_investigation",
        facesBlurred: true,
        healthNumberFlagged: false,
      },
    ],
    status: "draft",
  },
  plantedFacts: [
    "Vehicle: single vehicle, struck a guardrail",
    "Patient: unresponsive at scene, no ID on person",
    "Capacity: incapable (unconscious)",
    "Decision maker: unknown at scene, spouse en route (per bystander)",
    "Mechanism: single-vehicle, moderate front-end damage, airbag deployed",
    "Hazard: fuel smell reported, guardrail breached",
    "Vitals mentioned verbally: breathing, radial pulse present",
    "Family contact: spouse's phone number recovered from a dropped phone",
    "Belongings: wallet not found, phone bagged",
    "Time of call: approximately 22:41",
  ],
  transcript: {
    id: "tr_mva_002",
    captureId: "cap_mva_002",
    provider: "fake-transcriber",
    modelVersion: "fake-1",
    segments: [
      {
        start: 0.0,
        end: 3.8,
        speaker: "responder",
        text: "I'm recording for the medical record. Single vehicle, struck the guardrail, airbag's deployed.",
        confidence: 0.97,
      },
      {
        start: 3.9,
        end: 9.0,
        speaker: "responder",
        text: "Patient's unresponsive, no ID on them. Breathing, radial pulse present.",
        confidence: 0.96,
      },
      {
        start: 9.1,
        end: 12.5,
        speaker: "responder",
        text: "I can smell fuel, guardrail's breached, we need that secured.",
        confidence: 0.95,
      },
      {
        start: 12.6,
        end: 18.0,
        speaker: "bystander",
        text: "I think that's her phone on the ground, it's been ringing, might be her husband.",
        confidence: 0.85,
        nonResponder: true,
      },
      {
        start: 18.1,
        end: 22.0,
        speaker: "responder",
        text: "Bagging the phone as a belonging. No wallet found yet.",
        confidence: 0.93,
      },
    ],
  },
  draftNote: {
    id: "draft_mva_002",
    captureId: "cap_mva_002",
    modelVersion: "fake-condenser-1",
    promptVersion: "v1",
    sections: {
      mechanismOrComplaint: "Single-vehicle collision, struck guardrail, moderate front-end damage, airbag deployed.",
      timeline: "Call approximately 22:41; crew on scene 22:44.",
      patient: {
        capacity: "incapable",
        decisionMaker: "Unknown at scene; spouse reported en route by bystander (unconfirmed).",
      },
      hazards: "Fuel smell reported at scene; guardrail breached.",
      bystanderStatements: "Bystander identified a dropped phone, believed ringing from spouse.",
      belongings: "Phone bagged as belonging; wallet not located.",
      photoNotes: [{ assetId: "asset_mva_002_photo", caption: "Vehicle and guardrail damage, scene documentation." }],
    },
    spans: [
      { field: "sections.mechanismOrComplaint", transcriptSegmentIds: ["seg_1"] },
      { field: "sections.hazards", transcriptSegmentIds: ["seg_3"] },
      { field: "sections.belongings", transcriptSegmentIds: ["seg_5"] },
    ],
    flags: [
      {
        type: "non_responder_speech",
        ref: "transcript.segments[3]",
        note: "bystander speech re: spouse's phone, review before approval",
      },
      {
        type: "unsupported_claim",
        ref: "sections.patient.decisionMaker",
        note: "Spouse-as-decision-maker is a bystander claim, not confirmed. Kept as unconfirmed pending verification.",
      },
    ],
  },
  approvedNote: {
    id: "note_mva_002",
    draftNoteId: "draft_mva_002",
    incidentId: "inc_mva_002",
    sections: {
      mechanismOrComplaint: "Single-vehicle collision, struck guardrail, moderate front-end damage, airbag deployed.",
      timeline: "Call approximately 22:41; crew on scene 22:44.",
      patient: {
        capacity: "incapable",
        decisionMaker: "Unknown at scene; spouse reported en route (unconfirmed).",
      },
      hazards: "Fuel smell reported at scene; guardrail breached.",
      belongings: "Phone bagged as belonging; wallet not located.",
      photoNotes: [{ assetId: "asset_mva_002_photo", caption: "Vehicle and guardrail damage, scene documentation." }],
    },
    provenance: [
      { field: "sections.mechanismOrComplaint", source: "ai" },
      { field: "sections.hazards", source: "ai" },
      { field: "sections.patient.decisionMaker", source: "responder_edit" },
    ],
    approvedBy: "resp_fictional_gallagher",
    approvedAt: "2026-09-20T23:05:00-04:00",
    approvedAssetIds: ["asset_mva_002_photo"],
  },
};
