import { z } from "zod";
import { IsoDateTime } from "./common.js";

export const Capacity = z.enum(["capable", "incapable", "unknown"]);
export type Capacity = z.infer<typeof Capacity>;

export const PhotoNote = z.object({
  assetId: z.string(),
  caption: z.string(),
});
export type PhotoNote = z.infer<typeof PhotoNote>;

export const NoteSections = z.object({
  mechanismOrComplaint: z.string().optional(),
  timeline: z.string().optional(),
  patient: z
    .object({
      name: z.string().optional(),
      age: z.string().optional(),
      capacity: Capacity.optional(),
      decisionMaker: z.string().optional(),
    })
    .optional(),
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
