import type { CallInfo } from "../api/call";
import { PARAMEDIC_UNIT, type Role } from "../data/users";
import { hasReached, type IncidentState } from "./types";

export interface Alert {
  id: string;
  title: string;
  body: string;
  time: string;
  /** "today" alerts come from the live story, "yesterday" is sample history */
  day: "today" | "yesterday";
  source: "fire" | "paramedic" | "handoff";
}

const YESTERDAY: Record<Role, Alert[]> = {
  firefighter: [
    { id: "y-f-1", title: "Record 1043 received by triage", body: "Guelph General confirmed receipt at 14:52.", time: "14:52", day: "yesterday", source: "handoff" },
    { id: "y-f-2", title: "Unit 4412 corrected a field on 1042", body: "Allergies: none known → Penicillin.", time: "11:20", day: "yesterday", source: "paramedic" },
    { id: "y-f-3", title: "Device battery low on FF-02", body: "Charge the clip-on device before the next shift.", time: "08:05", day: "yesterday", source: "fire" },
  ],
  paramedic: [
    { id: "y-p-1", title: "Record 1043 received by triage", body: "Guelph General confirmed receipt at 14:52.", time: "14:52", day: "yesterday", source: "handoff" },
    { id: "y-p-2", title: "Woolwich Fire shared record 1042", body: "Accepted by Unit 4412 at 11:08.", time: "11:08", day: "yesterday", source: "fire" },
    { id: "y-p-3", title: "Handoff link for 1041 expired", body: "The 4 hour window closed; nothing was opened after 15:48.", time: "15:48", day: "yesterday", source: "handoff" },
  ],
};

/** everything that happened on the shared record, as the signed-in role would hear it */
/** `sample` adds yesterday's made-up history, only on the sample call */
export function alertsFor(role: Role, state: IncidentState, call: CallInfo, sample = false): Alert[] {
  const t = state.times;
  const live: Alert[] = [];
  const push = (id: string, title: string, body: string, time: string | undefined, source: Alert["source"]) =>
    live.push({ id, title, body, time: time ?? "", day: "today", source });

  if (role === "firefighter") {
    push("f-dispatched", "New call from dispatch", `${call.callId}, ${call.headline}. Nothing captured yet.`, t.dispatched, "fire");
    if (hasReached(state.stage, "on_scene")) push("f-on-scene", "Device is recording", "The clip-on device started capturing on scene.", t.on_scene, "fire");
    if (hasReached(state.stage, "needs_review")) push("f-review", "A note needs your review", `${call.latest?.text ?? "A new line was captured"}. Review before anything is shared.`, t.needs_review, "fire");
    if (hasReached(state.stage, "shared")) push("f-shared", `Record shared with ${PARAMEDIC_UNIT}`, "Delivered. You will hear when the crew accepts it.", t.shared, "paramedic");
    if (hasReached(state.stage, "accepted")) push("f-accepted", `${PARAMEDIC_UNIT} accepted the record`, "Identity is unlocked on their side.", t.accepted, "paramedic");
    if (state.lastParamedicUpdate)
      push("f-updated", "Paramedics updated this record", `${state.lastParamedicUpdate.by} ${state.lastParamedicUpdate.summary}.`, state.lastParamedicUpdate.at, "paramedic");
    if (hasReached(state.stage, "received")) push("f-received", "ER triage received the record", "Guelph General confirmed receipt. End of the handoff.", t.received, "handoff");
  } else {
    push("p-dispatched", "Call received from dispatch", `${call.callId}, ${call.headline}. Fire first.`, t.dispatched, "paramedic");
    if (hasReached(state.stage, "shared")) push("p-shared", "Woolwich Fire shared a record", "Accept it to unlock the patient's identity.", t.shared, "fire");
    if (hasReached(state.stage, "accepted")) push("p-accepted", "Record accepted", "Live updates from the fire crew will show here.", t.accepted, "paramedic");
    if (hasReached(state.stage, "to_verify")) push("p-verify", "Verify before handoff", "Fields the ER nurse reads first still need a look.", t.to_verify, "paramedic");
    if (hasReached(state.stage, "verified")) push("p-verified", "Info verified, QR ready", "Reveal the QR code at the hospital.", t.verified, "handoff");
    if (state.handoffOpenedAt) push("p-opened", "Hospital opened the handoff link", "The triage nurse is reading the summary.", state.handoffOpenedAt, "handoff");
    if (hasReached(state.stage, "received")) push("p-received", "Triage confirmed receipt", "Identity unlocked for the hospital. Handoff complete.", t.received, "handoff");
  }

  const all = [...live.reverse(), ...(sample ? YESTERDAY[role] : [])];
  return all.filter((a) => !state.dismissedAlertIds.includes(a.id));
}

export function unseenCount(alerts: Alert[], state: IncidentState): number {
  return alerts.filter((a) => a.day === "today" && !state.seenAlertIds.includes(a.id)).length;
}
