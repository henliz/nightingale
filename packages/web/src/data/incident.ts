/** fictional drill data, no real patient info anywhere in this prototype */
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
  /** set on rows that are a real call from the api */
  captureId?: string;
  /** the sample-data story, picking it flips the dashboard to demo mode */
  demo?: boolean;
}

export interface Observation {
  receivedAt: string;
  text: string;
}

/** latest captured line waiting on the captain, by story step */
export const LATEST_OBSERVATION = {
  on_scene: { receivedAt: "13:34", text: "Patient is found awake and confused at the foot of the stairs" },
  needs_review: { receivedAt: "13:42", text: "Patient blood pressure is 140/84" },
} as const satisfies Partial<Record<string, Observation>>;

/** what the paramedic crew sees before + after accepting the fire record */
export const PARAMEDIC_OBSERVATION = {
  fromCall: { receivedAt: "13:22", text: "Patient continues to respond to voice. Left hip pain reported during reassessment." },
  fromFire: { receivedAt: "13:32", text: "Patient is found awake and confused at the foot of the stairs" },
} as const satisfies Record<string, Observation>;
