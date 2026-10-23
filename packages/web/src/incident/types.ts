/**
 * Where the shared record is in the handoff story. One linear path, shared by the
 * firefighter, paramedic and triage views so each side sees the same record.
 */
export const STAGES = [
  "dispatched", // fire step 1: dispatch created the incident, nothing captured
  "on_scene", // fire step 2: device is recording, first observations in
  "needs_review", // fire step 3: transcribed fields waiting for the captain
  "reviewed", // fire step 5: captain saved the review
  "shared", // fire step 5 + paramedic step 2: link sent, not yet accepted
  "accepted", // paramedic step 3: crew confirmed receipt, identity unlocked
  "to_verify", // paramedic step 4: crew asked to review and verify before handoff
  "verified", // paramedic step 6: fields verified, QR ready
  "received", // paramedic step 8: ER triage confirmed receipt
] as const;

export type Stage = (typeof STAGES)[number];

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

/** True when `state` is at or past `target` on the path. */
export function hasReached(state: Stage, target: Stage): boolean {
  return stageIndex(state) >= stageIndex(target);
}

/** Clock times (HH:MM) recorded as the record moves along. */
export type StageTimes = Partial<Record<Stage, string>>;

/** A change the paramedic crew made after accepting the record. Both sides see it. */
export interface ParamedicUpdate {
  by: string;
  summary: string;
  at: string;
}

/** An observation typed in by a responder (not transcribed by the device). */
export interface AddedObservation {
  id: string;
  observedAt: string;
  note: string;
  measurements: Partial<Record<"pulse" | "respiratoryRate" | "bloodPressure" | "spo2" | "gcs", string>>;
  recordedBy: string;
}

export interface AddedFile {
  id: string;
  name: string;
  addedBy: string;
  at: string;
}

export type FieldReviewStatus = "confirmed" | "cleared";

/** A responder's decision on one ePCR field. Keeps who and when, for both sides. */
export interface FieldReview {
  value: string;
  status: FieldReviewStatus;
  by: string;
  at: string;
}

export interface IncidentState {
  stage: Stage;
  times: StageTimes;
  /** Wall-clock ms when the device started recording; drives the "active mm:ss" chip. */
  recordingStartedAt: number | null;
  lastParamedicUpdate: ParamedicUpdate | null;
  observations: AddedObservation[];
  files: AddedFile[];
  /** Keyed by ePCR field key. Missing means the suggestion stands, unreviewed. */
  fieldReviews: Record<string, FieldReview>;
  /** Paramedic step 6: when the QR code was first shown. */
  qrRevealedAt: string | null;
  /** Paramedic step 7: when the triage nurse first opened the secure link. */
  handoffOpenedAt: string | null;
  /** Paramedic step 8: when the triage nurse marked the summary as read. */
  handoffReadAt: string | null;
  /** Alert ids the signed-in person swiped away. */
  dismissedAlertIds: string[];
  /** Alert ids already seen in the panel; the bell badge counts the rest. */
  seenAlertIds: string[];
  /** Files removed from the record, by their display key. */
  deletedFileKeys: string[];
  /** Free-text notes added to Incident sections, keyed by section title. */
  incidentNotes: Record<string, { text: string; by: string; at: string }>;
}

export type IncidentAction =
  | { type: "crew_en_route"; at: string; now: number }
  | { type: "review_started"; at: string }
  | { type: "review_saved"; at: string }
  | { type: "shared"; at: string }
  | { type: "accepted"; at: string }
  | { type: "verify_started"; at: string }
  | { type: "verified"; at: string }
  | { type: "qr_revealed"; at: string }
  | { type: "handoff_opened"; at: string }
  | { type: "handoff_read"; at: string }
  | { type: "alerts_dismissed"; ids: string[] }
  | { type: "alerts_seen"; ids: string[] }
  | { type: "file_deleted"; key: string }
  | { type: "incident_note_saved"; section: string; text: string; by: string; at: string }
  | { type: "received"; at: string }
  | { type: "paramedic_updated"; update: ParamedicUpdate }
  | { type: "observation_added"; observation: AddedObservation }
  | { type: "field_reviewed"; key: string; review: FieldReview }
  | { type: "field_review_cleared"; key: string }
  | { type: "file_added"; file: AddedFile }
  | { type: "reset" };
