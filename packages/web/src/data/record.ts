import { hasReached, type Stage } from "../incident/types";

/** Fictional drill patient. */
export const PATIENT = { name: "Eleanor Walsh", recordNumber: "1044" } as const;

export interface LabelledValue {
  label: string;
  value: string;
}

export interface ResponderNote {
  source: string;
  text: string;
}

export interface TimelineEvent {
  time: string;
  title: string;
  detail: string;
  source: string;
}

export interface RecordFile {
  name: string;
  kind: string;
  stamp: string;
  /** Where the bytes live when the file came from the api. */
  url?: string;
}

export interface TranscriptTurn {
  time: string;
  speaker: string;
  text: string;
}

export interface PatientRecord {
  latestNote: ResponderNote;
  readings: readonly LabelledValue[];
  medicalBackground: readonly LabelledValue[];
  sceneAccount: readonly LabelledValue[];
  timeline: readonly TimelineEvent[];
  files: readonly RecordFile[];
  transcript: readonly TranscriptTurn[];
}

const NOT_RECORDED = "Not recorded";

/** Overlay A: what the captain knows on the way, dispatch text only. */
const BEFORE_ARRIVAL: PatientRecord = {
  latestNote: {
    source: "13:22 / reported from call",
    text: "Patient continues to respond to voice. Left hip pain reported during reassessment.",
  },
  readings: [
    { label: "Pulse", value: "--" },
    { label: "Respiratory rate", value: "--" },
    { label: "Blood pressure", value: "--" },
    { label: "SpO2", value: "--" },
    { label: "GCS", value: "---" },
  ],
  medicalBackground: [
    { label: "Medication list", value: "" },
    { label: "Allergies", value: NOT_RECORDED },
    { label: "Relevant past history", value: NOT_RECORDED },
  ],
  sceneAccount: [
    { label: "Chief complaint", value: "Fell down stairs / hip pain" },
    { label: "Reported mechanism", value: "Daughter heard a fall around 13:18 but did not see it. Head strike is unknown." },
    { label: "Family or witness", value: "--" },
    { label: "Found on arrival", value: "--" },
    { label: "Contact number", value: "--" },
  ],
  timeline: [],
  files: [],
  transcript: [],
};

/** Overlay B: the transcribed record once the crew has assessed the scene. */
const AFTER_SCENE: PatientRecord = {
  latestNote: {
    source: "14:28 / recorded by FF-12",
    text: "14:20 More drowsy, still responds to voice.",
  },
  readings: [
    { label: "Pulse", value: "98 bpm" },
    { label: "Respiratory rate", value: "20 /min" },
    { label: "Blood pressure", value: "140/84 mmHg" },
    { label: "SpO2", value: "95%" },
    { label: "GCS", value: "14/15" },
  ],
  medicalBackground: [
    { label: "Medication list", value: "Warfarin appears on a medication list. Current use is unconfirmed." },
    { label: "Allergies", value: NOT_RECORDED },
    { label: "Relevant past history", value: NOT_RECORDED },
  ],
  sceneAccount: [
    { label: "Chief complaint", value: "Fell down stairs / hip pain" },
    {
      label: "Found on arrival",
      value: "Found awake and confused at the foot of the stairs, reporting left hip pain. Unable to move the left leg.",
    },
    { label: "Reported mechanism", value: "Daughter heard a fall around 13:18 but did not see it. Head strike is unknown." },
    { label: "Family or witness", value: "Daughter on scene" },
    { label: "Contact number", value: NOT_RECORDED },
  ],
  timeline: [
    { time: "14:02", title: "First contact", detail: "Found awake and confused at the foot of the stairs.", source: "Woolwich Fire / FF-12" },
    { time: "14:06", title: "Spinal precautions", detail: "Reported by FF-12.", source: "Woolwich Fire / FF-12" },
    { time: "14:08", title: "Oxygen administered", detail: "Nasal cannula. Flow not recorded.", source: "Woolwich Fire / FF-12" },
    { time: "14:15", title: "Left leg splinted", detail: "Reported by FF-12.", source: "Woolwich Fire / FF-12" },
    { time: "14:20", title: "Change in awareness", detail: "More drowsy, still responds to voice.", source: "Woolwich Fire / FF-12" },
    { time: "14:28", title: "Observations recorded", detail: "HR 98 bpm / RR 20 / BP 140/84 / SpO2 95% / GCS 14", source: "Woolwich Fire / FF-12" },
  ],
  files: [
    { name: "Scene note.pdf", kind: "Reviewed document", stamp: "FF-12 / 17 Oct 14:31" },
    { name: "Medication list.jpg", kind: "Medication image / unverified", stamp: "FF-12 / 17 Oct 14:10" },
  ],
  transcript: [
    { time: "14:02", speaker: "Captain", text: "Patient is found awake and confused at the foot of the stairs." },
    { time: "14:03", speaker: "Captain", text: "Reporting left hip pain. Unable to move the left leg." },
    { time: "14:04", speaker: "Daughter", text: "I heard her fall around twenty past one. I didn't see it happen." },
    { time: "14:06", speaker: "Captain", text: "Spinal precautions in place." },
    { time: "14:08", speaker: "Captain", text: "Oxygen on by nasal cannula." },
    { time: "14:20", speaker: "Captain", text: "She's more drowsy now, still responds to voice." },
    { time: "14:28", speaker: "Captain", text: "Pulse 98, resps 20, blood pressure 140 over 84, sats 95, GCS 14." },
  ],
};

const SHARED_TIMELINE_EVENT: TimelineEvent = {
  time: "14:32",
  title: "Scene note shared",
  detail: "Reviewed by FF-12 at 14:31. Shared with Unit 4471.",
  source: "Woolwich Fire / FF-12",
};

/** The incident fields from the Woolwich Fire on-scene sheet, grouped as on the Incident tab. */
export const INCIDENT_SECTIONS: readonly { title: string; fields: readonly LabelledValue[] }[] = [
  {
    title: "Call and location",
    fields: [
      { label: "Dispatch number", value: NOT_RECORDED },
      { label: "Call / patient number", value: "0042" },
      { label: "Occurrence date", value: NOT_RECORDED },
      { label: "Time of occurrence", value: NOT_RECORDED },
      { label: "Occurrence location", value: NOT_RECORDED },
      { label: "FD officer in charge", value: NOT_RECORDED },
      { label: "Police name / number", value: NOT_RECORDED },
      { label: "Police occurrence number", value: NOT_RECORDED },
      { label: "First contact", value: "17 Oct 14:02" },
    ],
  },
  { title: "Patient identity and contacts", fields: [] },
  { title: "Clinical information and injury", fields: [] },
  { title: "Property, fire and resources", fields: [] },
  { title: "Vehicles and insurance", fields: [] },
  { title: "Crew, transport and service", fields: [] },
];

/** The record as it reads at a given point in the story. */
export function recordForStage(stage: Stage): PatientRecord {
  if (!hasReached(stage, "on_scene")) return BEFORE_ARRIVAL;
  if (!hasReached(stage, "shared")) return AFTER_SCENE;
  return { ...AFTER_SCENE, timeline: [...AFTER_SCENE.timeline, SHARED_TIMELINE_EVENT] };
}

export interface RecordInputs {
  stage: Stage;
  observations: readonly {
    observedAt: string;
    note: string;
    recordedBy: string;
    measurements: Partial<Record<"pulse" | "respiratoryRate" | "bloodPressure" | "spo2" | "gcs", string>>;
  }[];
  files: readonly { name: string; addedBy: string; at: string }[];
  deletedFileKeys?: readonly string[];
  /** A record from the api replaces the stage fixture; responder additions still layer on top. */
  base?: PatientRecord | null;
}

export function fileKey(file: RecordFile): string {
  return `${file.name}|${file.stamp}`;
}

const MEASUREMENT_LABEL: Record<string, string> = {
  pulse: "HR",
  respiratoryRate: "RR",
  bloodPressure: "BP",
  spo2: "SpO2",
  gcs: "GCS",
};

/** The stage snapshot plus anything responders typed in themselves. */
export function buildRecord({ stage, observations, files, deletedFileKeys = [], base: liveBase }: RecordInputs): PatientRecord {
  const base = liveBase ?? recordForStage(stage);
  if (observations.length === 0 && files.length === 0 && deletedFileKeys.length === 0) return base;

  const latest = observations.at(-1);
  const latestNote = latest ? { source: `${latest.observedAt} / recorded by ${latest.recordedBy}`, text: latest.note } : base.latestNote;

  const addedEvents: TimelineEvent[] = observations.map((o) => {
    const measured = Object.entries(o.measurements)
      .filter(([, v]) => v)
      .map(([k, v]) => `${MEASUREMENT_LABEL[k] ?? k} ${v}`)
      .join(" / ");
    return {
      time: o.observedAt,
      title: "Observation added",
      detail: measured ? `${o.note} (${measured})` : o.note,
      source: `Woolwich Fire / ${o.recordedBy}`,
    };
  });

  const addedFiles: RecordFile[] = files.map((f) => ({ name: f.name, kind: "Added by responder", stamp: `${f.addedBy} / ${f.at}` }));

  return {
    ...base,
    latestNote,
    // Appended in the order they were added: the drill's sample times are afternoon, a live
    // clock may not be, and a sort would bury what was just typed.
    timeline: [...base.timeline, ...addedEvents],
    files: [...base.files, ...addedFiles].filter((f) => !deletedFileKeys.includes(fileKey(f))),
  };
}
