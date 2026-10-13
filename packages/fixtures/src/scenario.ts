import type {
  ApprovedNote,
  Capture,
  DraftNote,
  Incident,
  Org,
  Transcript,
} from "@nightingale/schema";

export interface Scenario {
  /** short stable slug, used in test names + fixture file names */
  slug: string;
  description: string;
  orgs: Org[];
  incident: Incident;
  capture: Capture;
  transcript: Transcript;
  /** facts scripted on purpose into the transcript, for the fact recall score in ARCHITECTURE.md section 8 */
  plantedFacts: string[];
  draftNote: DraftNote;
  approvedNote: ApprovedNote;
}
