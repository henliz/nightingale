// the ePCR draft the captain reviews in fire step 4, in Woolwich Fire paper sheet order.
// values are only ever what was said out loud, unsure fields get flagged never filled. fictional drill data
// sample call tabs are summary / patient / clinical / fire / service, real calls bring their own per role
export type EpcrTab = string;

export const EPCR_TABS: readonly { id: EpcrTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "patient", label: "Patient" },
  { id: "clinical", label: "Clinical" },
  { id: "fire", label: "Fire sheet" },
  { id: "service", label: "Service" },
];

export interface EpcrField {
  key: string;
  label: string;
  /** what the pipeline suggested from the transcript, null = nothing captured */
  suggested: string | null;
  kind?: "input" | "textarea" | "checkbox";
  /** unsure, red outline until the captain reviews it */
  flagged?: boolean;
  /** why it's flagged, from the note */
  flagNote?: string;
  /** which note section it came from (`sections.patient`), so a flag on that section can find it */
  flagPath?: string;
  /** transcript turn ids backing the suggestion */
  evidence?: readonly string[];
  /** takes the full row instead of half */
  wide?: boolean;
}

export interface EpcrSection {
  title: string;
  /** optional muted suffix after the title, e.g. "@ 14:08" */
  titleNote?: string;
  tab: EpcrTab;
  fields: readonly EpcrField[];
  /** columns per row, 2 by default */
  columns?: 2 | 3;
}

export const NOT_CAPTURED = "Not captured";

export const EPCR_SECTIONS: readonly EpcrSection[] = [
  {
    title: "Scene and clinical summary",
    tab: "summary",
    fields: [
      { key: "chiefComplaint", label: "Chief Complaint", suggested: "Left hip pain after a fall", evidence: ["t-1405-2", "t-1405-5"] },
      { key: "timeOfOccurrence", label: "Time of Occurrence", suggested: "Around 14:00, reported by daughter", evidence: ["t-1406-2", "t-1406-4"] },
      {
        key: "incidentHistory",
        label: "Incident History",
        kind: "textarea",
        wide: true,
        suggested:
          "Daughter heard a fall around 14:00. She did not see it. Patient found seated at the foot of the stairs, awake and reporting left hip pain.",
        evidence: ["t-1405-2", "t-1405-5", "t-1406-2"],
      },
    ],
  },
  {
    title: "Observations",
    titleNote: "@ 14:08",
    tab: "summary",
    columns: 3,
    fields: [
      { key: "pulse", label: "Pulse", suggested: "98 bpm at 14:08", evidence: ["t-1408-1"] },
      { key: "resp", label: "Resp:", suggested: "20 /min at 14:08", evidence: ["t-1408-2"] },
      { key: "bp", label: "B/P:", suggested: "140/84 mmHg at 14:08", evidence: ["t-1408-4", "t-1408-5"] },
    ],
  },
  {
    title: "Care and response",
    tab: "summary",
    fields: [{ key: "careAndResponse", label: "Add what was done and how the patient responded.", kind: "textarea", wide: true, suggested: null }],
  },
  {
    title: "Identity",
    tab: "patient",
    fields: [
      { key: "surname", label: "Surname", suggested: "Welsh", evidence: ["t-1403-2"] },
      { key: "initial", label: "Initial", suggested: null },
      { key: "firstName", label: "First Name", suggested: "Eleanor", evidence: ["t-1403-2"] },
      { key: "dob", label: "Date of Birth (YYYY-MM-DD)", suggested: "1952-05-14", evidence: ["t-1403-4"] },
      { key: "sex", label: "Sex", suggested: "Female", evidence: ["t-1403-2"] },
      { key: "patientName", label: "Patient Name", suggested: "Eleanor Welsh", evidence: ["t-1403-2"] },
    ],
  },
  {
    title: "Address and registration",
    tab: "patient",
    fields: [
      { key: "mailingAddress", label: "Mailing Address", suggested: null, flagged: true },
      { key: "homeAddress", label: "Home Address", suggested: "123 Hazelnut Rd" },
      { key: "city", label: "City / Town", suggested: "Geulph" },
      { key: "province", label: "Province", suggested: "Ontario" },
      { key: "country", label: "Country", suggested: null },
      { key: "postalCode", label: "Postal Code", suggested: null },
      { key: "hospitalRegistration", label: "Hospital Registration Num.", suggested: null },
      { key: "healthCard", label: "Health Card Number", suggested: null },
      { key: "version", label: "Version", suggested: null },
      { key: "specialCodes", label: "Special Codes", suggested: null },
      { key: "sam", label: "S.A.M.", kind: "checkbox", suggested: null },
    ],
  },
  {
    title: "History",
    tab: "clinical",
    fields: [
      { key: "medications", label: "Medications", suggested: "Warfarin listed, current use unconfirmed", flagged: true, evidence: ["t-1410-2", "t-1410-3", "t-1410-4"] },
      { key: "allergies", label: "Allergies", suggested: null },
      { key: "pastHistory", label: "Relevant past history", suggested: null },
      { key: "lastOralIntake", label: "Last oral intake", suggested: null },
    ],
  },
  {
    title: "Assessment",
    tab: "clinical",
    fields: [
      { key: "levelOfConsciousness", label: "Level of consciousness", suggested: "Awake, speaking", evidence: ["t-1405-5"] },
      { key: "painLocation", label: "Pain location", suggested: "Left hip", evidence: ["t-1405-2"] },
      { key: "headStrike", label: "Head strike", suggested: null, flagged: true, evidence: ["t-1406-2"] },
      { key: "spo2", label: "SpO2", suggested: null },
    ],
  },
  {
    title: "Call and location",
    tab: "fire",
    fields: [
      { key: "dispatchNumber", label: "Dispatch number", suggested: null },
      { key: "callNumber", label: "Call / patient number", suggested: "0042" },
      { key: "fdOfficer", label: "FD officer in charge", suggested: "Alvin Seville" },
      { key: "occurrenceLocation", label: "Occurrence location", suggested: "Stairs, 42 Mill Street, Maryhill" },
    ],
  },
  {
    title: "Crew, transport and service",
    tab: "service",
    fields: [
      { key: "unit", label: "Unit", suggested: "FF-12" },
      { key: "crew", label: "Crew on scene", suggested: "2" },
      { key: "handoffTo", label: "Handoff to", suggested: null },
      { key: "destination", label: "Transport destination", suggested: null },
    ],
  },
];

export const EPCR_FIELD_BY_KEY: ReadonlyMap<string, EpcrField> = new Map(
  EPCR_SECTIONS.flatMap((s) => s.fields.map((f) => [f.key, f] as const)),
);

export interface CaptureTurn {
  id: string;
  time: string;
  speaker: string;
  text: string;
}

export interface CaptureExcerpt {
  time: string;
  turns: readonly CaptureTurn[];
}

/** who said what on scene, grouped like the design */
export const CAPTURE_EXCERPTS: readonly CaptureExcerpt[] = [
  {
    time: "14:03",
    turns: [
      { id: "t-1403-1", time: "14:03", speaker: "Responder", text: "Hi, I’m Alvin. Can you tell me your full name?" },
      { id: "t-1403-2", time: "14:03", speaker: "Patient", text: "Eleanor Welsh" },
      { id: "t-1403-3", time: "14:03", speaker: "Responder", text: "And your date of birth, Eleanor?" },
      { id: "t-1403-4", time: "14:03", speaker: "Patient", text: "May fourteenth, nineteen fifty-two." },
    ],
  },
  {
    time: "14:05",
    turns: [
      { id: "t-1405-1", time: "14:05", speaker: "Responder", text: "Eleanor, tell me what’s hurting." },
      { id: "t-1405-2", time: "14:05", speaker: "Patient", text: "My left hip. I fell here on the stairs." },
      { id: "t-1405-3", time: "14:05", speaker: "Responder", text: "You’re sitting at the bottom of the stairs now. Is that where we found you?" },
      { id: "t-1405-4", time: "14:05", speaker: "Patient", text: "Yes." },
      { id: "t-1405-5", time: "14:05", speaker: "Responder", text: "Patient awake and speaking with us. Seated at the foot of the stairs, reporting left hip pain." },
    ],
  },
  {
    time: "14:06",
    turns: [
      { id: "t-1406-1", time: "14:06", speaker: "Responder", text: "You’re Kathy’s daughter? Did you see the fall?" },
      { id: "t-1406-2", time: "14:06", speaker: "Daughter", text: "Yes, I’m her daughter. I heard her fall around two o’clock, but I didn’t see it happen." },
      { id: "t-1406-3", time: "14:06", speaker: "Responder", text: "Around two, not an exact time?" },
      { id: "t-1406-4", time: "14:06", speaker: "Daughter", text: "That’s right. I heard the noise and came over." },
    ],
  },
  {
    time: "14:08",
    turns: [
      { id: "t-1408-1", time: "14:08", speaker: "Responder", text: "I’m recording these observations at fourteen oh eight. Pulse is ninety-eight." },
      { id: "t-1408-2", time: "14:08", speaker: "Second responder", text: "Respirations twenty per minute." },
      { id: "t-1408-3", time: "14:08", speaker: "Responder", text: "And the blood pressure?" },
      { id: "t-1408-4", time: "14:08", speaker: "Second responder", text: "One-forty over eighty-four." },
      { id: "t-1408-5", time: "14:08", speaker: "Responder", text: "Blood pressure one-forty over eighty-four, recorded." },
    ],
  },
  {
    time: "14:10",
    turns: [
      { id: "t-1410-1", time: "14:10", speaker: "Daughter", text: "I brought this medication list." },
      { id: "t-1410-2", time: "14:10", speaker: "Responder", text: "I can see warfarin on it. Do you know if she’s still taking it?" },
      { id: "t-1410-3", time: "14:10", speaker: "Daughter", text: "I’m not sure this list is up to date." },
      { id: "t-1410-4", time: "14:10", speaker: "Responder", text: "Okay. Warfarin is listed, but current use is unconfirmed." },
    ],
  },
];

export function turnsById(excerpts: readonly CaptureExcerpt[]): ReadonlyMap<string, CaptureTurn> {
  return new Map(excerpts.flatMap((e) => e.turns.map((t) => [t.id, t] as const)));
}

export const CAPTURE_TURN_BY_ID: ReadonlyMap<string, CaptureTurn> = turnsById(CAPTURE_EXCERPTS);

/** first field a transcript turn supports, so clicking speech selects a field */
export function fieldForTurn(turnId: string, sections: readonly EpcrSection[] = EPCR_SECTIONS): EpcrField | undefined {
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.evidence?.includes(turnId)) return field;
    }
  }
  return undefined;
}

export const CAPTURE_META = {
  patientLabel: "Patient 007",
  captureEnded: "14:12",
  imported: "14:13",
  summary: "1 hour, 2 injuries identified on call transcript",
} as const;
