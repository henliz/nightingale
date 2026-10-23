/** Fictional drill data. No real patient information anywhere in this prototype. */
import type { Role } from "./users";

export const CURRENT_CALL = {
  callId: "1020382",
  title: "Elderly patient fell down stairs",
  patientLine: "Patient 007 | Woolwich  FF-12",
  patientLineByRole: { firefighter: "Patient 007 | Woolwich  FF-12", paramedic: "Patient 007 | EMS-21" } as Record<Role, string>,
  firstContact: "13:22",
  dispatch: {
    createdAt: "13:20",
    text: "Elderly female fell down stairs, conscious, hip pain. 42 Mill Street, Maryhill. Tiered response, fire first.",
  },
  paramedicUnit: "Unit 4471",
} as const;

export interface RecordRow {
  callId: string;
  unit: string;
  callNumber: string;
  sharedAt: string;
}

const RECORD_ROWS = [
  { callId: "1020381", callNumber: "1043", sharedAt: "14:35" },
  { callId: "1020380", callNumber: "1042", sharedAt: "14:35" },
  { callId: "1020379", callNumber: "1041", sharedAt: "11:48" },
  { callId: "1020378", callNumber: "1040", sharedAt: "10:04" },
] as const;

const UNITS_BY_ROLE: Record<Role, readonly string[]> = {
  firefighter: ["FF-12", "FF-02", "FF-06", "FF-07"],
  paramedic: ["EMS-12", "EMS-17", "EMS-21", "EMS-05"],
};

/** Each service sees its own recent calls. */
export function recentRecordsFor(role: Role): RecordRow[] {
  return RECORD_ROWS.map((row, i) => ({ ...row, unit: UNITS_BY_ROLE[role][i] ?? "" }));
}

/** @deprecated use recentRecordsFor */
export const RECENT_RECORDS: readonly RecordRow[] = recentRecordsFor("firefighter");

export const TOTAL_RECORDS = 6;

export interface Observation {
  receivedAt: string;
  text: string;
}

/** The latest captured line waiting on the captain, by story step. */
export const LATEST_OBSERVATION = {
  on_scene: { receivedAt: "13:34", text: "Patient is found awake and confused at the foot of the stairs" },
  needs_review: { receivedAt: "13:42", text: "Patient blood pressure is 140/84" },
} as const satisfies Partial<Record<string, Observation>>;

/** What the paramedic crew sees before and after accepting the fire record. */
export const PARAMEDIC_OBSERVATION = {
  fromCall: { receivedAt: "13:22", text: "Patient continues to respond to voice. Left hip pain reported during reassessment." },
  fromFire: { receivedAt: "13:32", text: "Patient is found awake and confused at the foot of the stairs" },
} as const satisfies Record<string, Observation>;
