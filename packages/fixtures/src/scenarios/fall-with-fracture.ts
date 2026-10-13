import type { Scenario } from "../scenario.js";

/**
 * fictional scenario, scripted for drills and tests only, no real patient info ever
 *
 * fire crew gets there first to a witnessed fall at a house. patient is capable and chatty,
 * a neighbour (bystander) is also talking on the recording, which should get flagged as
 * non responder speech for redaction review before anything gets approved
 */
export const fallWithFracture: Scenario = {
  slug: "fall-with-fracture",
  description:
    "Fictional 78-year-old fall patient, witnessed by a neighbour, capable, hip pain suspected.",
  orgs: [
    { id: "org_woolwich_fire", type: "fire", name: "Woolwich Fire (fictional)", retentionDays: 365 },
    { id: "org_region_ems", type: "paramedic", name: "Region Paramedic Service (fictional)", retentionDays: 2555 },
    { id: "org_grand_river_ed", type: "hospital", name: "Grand River ED (fictional)", retentionDays: 3650 },
  ],
  incident: {
    id: "inc_fall_001",
    createdAt: "2026-09-14T14:02:00-04:00",
    orgsInvolved: ["org_woolwich_fire", "org_region_ems"],
    destinationConfirmed: false,
  },
  capture: {
    id: "cap_fall_001",
    incidentId: "inc_fall_001",
    orgId: "org_woolwich_fire",
    responderId: "resp_fictional_tom",
    deviceId: "device_drill_01",
    mode: "wearable",
    startedAt: "2026-09-14T14:05:10-04:00",
    durationSec: 74,
    assets: [
      {
        id: "asset_fall_001_audio",
        captureId: "cap_fall_001",
        kind: "audio",
        vaultKey: "vault/fall-with-fracture/audio-001.wav",
        sha256: "a".repeat(64),
        capturedAt: "2026-09-14T14:05:10-04:00",
      },
      {
        id: "asset_fall_001_photo",
        captureId: "cap_fall_001",
        kind: "photo",
        vaultKey: "vault/fall-with-fracture/photo-001.jpg",
        sha256: "b".repeat(64),
        capturedAt: "2026-09-14T14:06:40-04:00",
        photoPurpose: "medical",
        facesBlurred: true,
        healthNumberFlagged: false,
      },
    ],
    status: "draft",
  },
  plantedFacts: [
    "Patient name: Eleanor Voss (fictional)",
    "Age: 78",
    "Mechanism: fell on the back porch steps, witnessed by neighbour",
    "Time of fall: approximately 1:40 PM",
    "Complaint: right hip pain, unable to bear weight",
    "Capacity: capable, oriented x3",
    "Medication mentioned: apixaban (blood thinner)",
    "Allergy mentioned: penicillin",
    "Hazard: wet steps, no handrail",
    "Belongings: patient's purse and cane taken in the ambulance",
  ],
  transcript: {
    id: "tr_fall_001",
    captureId: "cap_fall_001",
    provider: "fake-transcriber",
    modelVersion: "fake-1",
    segments: [
      {
        start: 0.0,
        end: 4.2,
        speaker: "responder",
        text: "I'm recording for the medical record. Can you tell me your name?",
        confidence: 0.98,
      },
      {
        start: 4.3,
        end: 7.1,
        speaker: "patient",
        text: "Eleanor Voss. I'm seventy-eight.",
        confidence: 0.95,
      },
      {
        start: 7.2,
        end: 13.5,
        speaker: "patient",
        text: "I slipped on the back porch steps, must have been around one forty. My right hip hurts, I can't put weight on it.",
        confidence: 0.93,
      },
      {
        start: 13.6,
        end: 15.0,
        speaker: "responder",
        text: "Are you on any medications or have any allergies?",
        confidence: 0.97,
      },
      {
        start: 15.1,
        end: 19.4,
        speaker: "patient",
        text: "I take apixaban for my blood, and I'm allergic to penicillin.",
        confidence: 0.94,
      },
      {
        start: 19.5,
        end: 25.0,
        speaker: "bystander",
        text: "Those steps have been wet all week, there's no handrail, I keep telling her son to fix it.",
        confidence: 0.88,
        nonResponder: true,
      },
      {
        start: 25.1,
        end: 29.0,
        speaker: "patient",
        text: "Can you grab my purse and my cane from by the door?",
        confidence: 0.9,
      },
    ],
  },
  draftNote: {
    id: "draft_fall_001",
    captureId: "cap_fall_001",
    modelVersion: "fake-condenser-1",
    promptVersion: "v1",
    sections: {
      mechanismOrComplaint: "Witnessed fall on wet back porch steps; right hip pain, unable to bear weight.",
      timeline: "Fall occurred approximately 13:40; crew on scene 14:05.",
      patient: {
        name: "Eleanor Voss",
        age: "78",
        capacity: "capable",
      },
      medsAndAllergiesMentioned: ["apixaban", "penicillin (allergy)"],
      hazards: "Wet porch steps, no handrail.",
      bystanderStatements: "Neighbour states steps have been wet all week with no handrail.",
      belongings: "Purse and cane taken with patient.",
      photoNotes: [{ assetId: "asset_fall_001_photo", caption: "Porch steps, wet surface visible." }],
    },
    spans: [
      { field: "sections.mechanismOrComplaint", transcriptSegmentIds: ["seg_1", "seg_2"] },
      { field: "sections.medsAndAllergiesMentioned", transcriptSegmentIds: ["seg_4"] },
      { field: "sections.hazards", transcriptSegmentIds: ["seg_5"] },
    ],
    flags: [
      {
        type: "non_responder_speech",
        ref: "transcript.segments[5]",
        note: "bystander (neighbour) speech, review before approval",
      },
    ],
  },
  approvedNote: {
    id: "note_fall_001",
    draftNoteId: "draft_fall_001",
    incidentId: "inc_fall_001",
    sections: {
      mechanismOrComplaint: "Witnessed fall on wet back porch steps; right hip pain, unable to bear weight.",
      timeline: "Fall occurred approximately 13:40; crew on scene 14:05.",
      patient: {
        name: "Eleanor Voss",
        age: "78",
        capacity: "capable",
      },
      medsAndAllergiesMentioned: ["apixaban", "penicillin (allergy)"],
      hazards: "Wet porch steps, no handrail.",
      belongings: "Purse and cane taken with patient.",
      photoNotes: [{ assetId: "asset_fall_001_photo", caption: "Porch steps, wet surface visible." }],
    },
    provenance: [
      { field: "sections.mechanismOrComplaint", source: "ai" },
      { field: "sections.hazards", source: "ai" },
    ],
    approvedBy: "resp_fictional_tom",
    approvedAt: "2026-09-14T14:20:00-04:00",
    approvedAssetIds: ["asset_fall_001_photo"],
  },
};
