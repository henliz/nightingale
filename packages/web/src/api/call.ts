import type { NoteSections } from "@nightingale/schema";
import { HANDOFF_HAZARDS } from "../data/handoff";
import { CURRENT_CALL, LATEST_OBSERVATION } from "../data/incident";
import { PATIENT } from "../data/record";
import { sessionLines } from "./mapNote";
import type { DrillSession } from "./types";

// everything the queue, cards, dialogs and handoff say about "this call", straight from the
// real session. nothing here is made up, a blank in the note stays a blank

export interface CallInfo {
  /** "Case 1 · Cardiac arrest (BBQ)", or the date for an untitled live call */
  callId: string;
  /** one line for the card heading */
  headline: string;
  /** null until someone says the patient's name */
  patientName: string | null;
  /** "Unnamed patient · 57 · male" */
  patientLine: string;
  firstContact: string;
  dispatchAt: string;
  dispatchText: string;
  hazards: string;
  /** newest thing heard on scene */
  latest: { at: string; text: string } | null;
  sections: NoteSections;
}

export const UNNAMED = "Unnamed patient";

function clock(ms: number | undefined): string {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const hhmm = (t: string | undefined) => (t ? t.slice(0, 5) : undefined);

export function callInfo(session: DrillSession | null): CallInfo {
  if (!session) {
    return {
      callId: "Loading",
      headline: "Waiting for the api",
      patientName: null,
      patientLine: UNNAMED,
      firstContact: "",
      dispatchAt: "",
      dispatchText: "",
      hazards: "",
      latest: null,
      sections: {},
    };
  }
  const s: NoteSections = session.epcr?.sections ?? {};
  const t = s.incident?.times ?? {};
  const when = new Date(session.startedAt).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const lines = sessionLines(session);
  const last = lines.at(-1);
  const hazards = [s.scene?.safety, s.hazards].filter(Boolean).join(". ");
  return {
    callId: session.title ?? `Call ${when}`,
    headline: s.chiefComplaint ?? s.incident?.dispatchReason ?? "Waiting for the first details",
    patientName: s.patient?.name ?? null,
    patientLine: [s.patient?.name ?? UNNAMED, s.patient?.age, s.patient?.sex].filter(Boolean).join(" · "),
    firstContact: hhmm(t.patientContact) ?? hhmm(t.onScene) ?? clock(session.startedAt),
    dispatchAt: hhmm(t.callReceived) ?? clock(session.startedAt),
    dispatchText: [s.incident?.dispatchReason, s.incident?.location].filter(Boolean).join(", ") || "No dispatch details captured.",
    hazards: hazards ? `Scene safety and hazards: ${hazards}` : "Scene safety and hazards: none mentioned on scene.",
    latest: last ? { at: clock(last.at), text: last.text } : null,
    sections: s,
  };
}

/** the sample call, from the fixtures, so it reads the same as before */
export const SAMPLE_CALL: CallInfo = {
  callId: CURRENT_CALL.callId,
  headline: CURRENT_CALL.title,
  patientName: PATIENT.name,
  patientLine: CURRENT_CALL.patientLine,
  firstContact: CURRENT_CALL.firstContact,
  dispatchAt: CURRENT_CALL.dispatch.createdAt,
  dispatchText: CURRENT_CALL.dispatch.text,
  hazards: HANDOFF_HAZARDS,
  latest: { at: LATEST_OBSERVATION.needs_review.receivedAt, text: LATEST_OBSERVATION.needs_review.text },
  sections: {},
};
