import { z } from "zod";
import { IsoDateTime } from "./common.js";

export const Capacity = z.enum(["capable", "incapable", "unknown"]);
export type Capacity = z.infer<typeof Capacity>;

export const PhotoNote = z.object({
  assetId: z.string(),
  caption: z.string(),
});
export type PhotoNote = z.infer<typeof PhotoNote>;

// epcr-shaped pieces (oct 17 2026). everything optional and only ever filled from what
// was actually said, same rule as the rest of the note. deliberately no "impression" /
// working diagnosis field, the note summarizes, it doesn't diagnose (ARCHITECTURE.md
// section 2, stay out of medical-device territory)
export const IncidentTimes = z.object({
  callReceived: z.string().optional(),
  enRoute: z.string().optional(),
  onScene: z.string().optional(),
  patientContact: z.string().optional(),
  departScene: z.string().optional(),
  atDestination: z.string().optional(),
});
export type IncidentTimes = z.infer<typeof IncidentTimes>;

export const IncidentInfo = z.object({
  location: z.string().optional(),
  dispatchReason: z.string().optional(),
  unitsOnScene: z.string().optional(),
  times: IncidentTimes.optional(),
});
export type IncidentInfo = z.infer<typeof IncidentInfo>;

export const SceneInfo = z.object({
  numberOfPatients: z.string().optional(),
  environment: z.string().optional(),
  safety: z.string().optional(),
  othersOnScene: z.string().optional(),
});
export type SceneInfo = z.infer<typeof SceneInfo>;

export const Sample = z.object({
  signsSymptoms: z.string().optional(),
  allergies: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
  pastHistory: z.string().optional(),
  lastOralIntake: z.string().optional(),
  events: z.string().optional(),
});
export type Sample = z.infer<typeof Sample>;

export const Opqrst = z.object({
  onset: z.string().optional(),
  provocation: z.string().optional(),
  quality: z.string().optional(),
  radiation: z.string().optional(),
  severity: z.string().optional(),
  time: z.string().optional(),
});
export type Opqrst = z.infer<typeof Opqrst>;

/** one set of vitals, only numbers someone actually said out loud */
export const VitalsSet = z.object({
  time: z.string().optional(),
  loc: z.string().optional(),
  bp: z.string().optional(),
  hr: z.string().optional(),
  rr: z.string().optional(),
  spo2: z.string().optional(),
  gcs: z.string().optional(),
  temp: z.string().optional(),
  glucose: z.string().optional(),
  pain: z.string().optional(),
  skin: z.string().optional(),
});
export type VitalsSet = z.infer<typeof VitalsSet>;

export const InterventionEntry = z.object({
  time: z.string().optional(),
  intervention: z.string(),
  response: z.string().optional(),
});
export type InterventionEntry = z.infer<typeof InterventionEntry>;

export const TransportInfo = z.object({
  destination: z.string().optional(),
  priority: z.string().optional(),
  position: z.string().optional(),
  handoffTo: z.string().optional(),
});
export type TransportInfo = z.infer<typeof TransportInfo>;

export const NoteSections = z.object({
  incident: IncidentInfo.optional(),
  scene: SceneInfo.optional(),
  chiefComplaint: z.string().optional(),
  mechanismOrComplaint: z.string().optional(),
  timeline: z.string().optional(),
  patient: z
    .object({
      name: z.string().optional(),
      age: z.string().optional(),
      sex: z.string().optional(),
      dob: z.string().optional(),
      weight: z.string().optional(),
      capacity: Capacity.optional(),
      decisionMaker: z.string().optional(),
    })
    .optional(),
  sample: Sample.optional(),
  opqrst: Opqrst.optional(),
  vitals: z.array(VitalsSet).optional(),
  /** head-to-toe / abc findings as said, not an interpretation of them */
  physicalExam: z.string().optional(),
  interventions: z.array(InterventionEntry).optional(),
  transport: TransportInfo.optional(),
  /** short plain summary of what was said, in order. not a clinical impression */
  narrative: z.string().optional(),
  /** qualitative, what fire can actually observe at emr level (loc, breathing,
   * pulse present/quality, skin), not numeric monitor vitals, that's still
   * paramedic territory. this is gabe's "main vital signs" from the oct 6 interview */
  conditionObserved: z.string().optional(),
  /** first aid / actions fire actually took, separate from what they observed.
   * gabe named this directly: "what interventions were performed" */
  interventionsPerformed: z.string().optional(),
  medsAndAllergiesMentioned: z.array(z.string()).optional(),
  hazards: z.string().optional(),
  bystanderStatements: z.string().optional(),
  belongings: z.string().optional(),
  familyContact: z.string().optional(),
  photoNotes: z.array(PhotoNote).optional(),
});
export type NoteSections = z.infer<typeof NoteSections>;

export const NoteFlagType = z.enum([
  "low_confidence",
  "non_responder_speech",
  "health_number",
  "unsupported_claim",
]);
export type NoteFlagType = z.infer<typeof NoteFlagType>;

export const NoteFlag = z.object({
  type: NoteFlagType,
  ref: z.string(),
  note: z.string().optional(),
});
export type NoteFlag = z.infer<typeof NoteFlag>;

export const NoteSpan = z.object({
  field: z.string(),
  transcriptSegmentIds: z.array(z.string()),
});
export type NoteSpan = z.infer<typeof NoteSpan>;

export const DraftNote = z.object({
  id: z.string(),
  captureId: z.string(),
  modelVersion: z.string(),
  promptVersion: z.string(),
  sections: NoteSections,
  /** every claim needs a source segment, no making stuff up */
  spans: z.array(NoteSpan),
  flags: z.array(NoteFlag),
});
export type DraftNote = z.infer<typeof DraftNote>;

export const ProvenanceSource = z.enum(["ai", "responder_edit"]);
export type ProvenanceSource = z.infer<typeof ProvenanceSource>;

export const Provenance = z.object({
  field: z.string(),
  source: ProvenanceSource,
});
export type Provenance = z.infer<typeof Provenance>;

export const ApprovedNote = z.object({
  id: z.string(),
  draftNoteId: z.string(),
  incidentId: z.string(),
  /** post-edit, whatever the responder actually approved */
  sections: NoteSections,
  provenance: z.array(Provenance),
  approvedBy: z.string(),
  approvedAt: IsoDateTime,
  /** only these photos get shared, nothing else */
  approvedAssetIds: z.array(z.string()),
});
export type ApprovedNote = z.infer<typeof ApprovedNote>;
