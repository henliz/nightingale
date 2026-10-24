import type { DraftNote, NoteSections, VitalsSet } from "@nightingale/schema";
import type { CaptureExcerpt, CaptureTurn } from "../data/epcr";
import type { LabelledValue, PatientRecord, RecordFile, ResponderNote, TimelineEvent, TranscriptTurn } from "../data/record";
import { assetUrl } from "./client";
import type { DrillSession, LiveLine } from "./types";

const NOT_RECORDED = "Not recorded";

function clock(ms: number | undefined): string {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function latestVitals(sections: NoteSections): VitalsSet | undefined {
  return sections.vitals?.at(-1);
}

function joinList(v: string[] | undefined): string {
  return v && v.length > 0 ? v.join(", ") : "";
}

/** every speaker-labelled line across the session's chunks, in capture order */
export function sessionLines(session: DrillSession): LiveLine[] {
  return session.assets
    .filter((a) => a.kind === "audio" && a.transcript)
    .sort((a, b) => (a.capturedAt ?? a.completedAt) - (b.capturedAt ?? b.completedAt))
    .flatMap((a) => a.transcript ?? []);
}

/** the first voice heard is whoever's wearing the device, everyone else is a bystander or the patient */
function speakerLabel(speaker: string, responder: string | undefined): string {
  if (responder && speaker === responder) return "Responder";
  return speaker;
}

export function mapTranscript(session: DrillSession): TranscriptTurn[] {
  const responder = session.speakers?.[0];
  return sessionLines(session).map((l) => ({
    time: clock(l.at),
    speaker: speakerLabel(l.speaker, responder),
    text: l.text,
  }));
}

/** review page excerpts, grouped by minute, with the segment[i] ids the note's spans point at */
export function mapExcerpts(session: DrillSession): CaptureExcerpt[] {
  const responder = session.speakers?.[0];
  const groups = new Map<string, CaptureTurn[]>();
  sessionLines(session).forEach((l, i) => {
    const time = clock(l.at);
    const turn: CaptureTurn = { id: `segment[${i}]`, time, speaker: speakerLabel(l.speaker, responder), text: l.text };
    const list = groups.get(time) ?? [];
    list.push(turn);
    groups.set(time, list);
  });
  return Array.from(groups, ([time, turns]) => ({ time, turns }));
}

function photos(session: DrillSession): RecordFile[] {
  return session.assets
    .filter((a) => a.kind === "photo")
    .map((a) => ({
      name: a.file?.split("/").pop() ?? a.assetId,
      kind: a.caption ?? "Scene photo",
      stamp: `${session.deviceId ?? "device"} / ${clock(a.capturedAt ?? a.completedAt)}`,
      url: assetUrl(session, a),
    }));
}

function timeline(sections: NoteSections): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const t = sections.incident?.times;
  const src = sections.incident?.unitsOnScene ?? "responder";
  if (t?.callReceived) events.push({ time: t.callReceived.slice(0, 5), title: "Call received", detail: sections.incident?.dispatchReason ?? "", source: "dispatch" });
  if (t?.onScene) events.push({ time: t.onScene.slice(0, 5), title: "On scene", detail: sections.scene?.environment ?? "", source: src });
  if (t?.patientContact) events.push({ time: t.patientContact.slice(0, 5), title: "First contact", detail: sections.conditionObserved ?? "", source: src });
  for (const v of sections.vitals ?? []) {
    const parts = [v.hr && `HR ${v.hr}`, v.rr && `RR ${v.rr}`, v.bp && `BP ${v.bp}`, v.spo2 && `SpO2 ${v.spo2}`, v.gcs && `GCS ${v.gcs}`, v.pain && `pain ${v.pain}`].filter(Boolean);
    events.push({ time: (v.time ?? "").slice(0, 5), title: "Observations recorded", detail: parts.join(" / ") || "Vitals noted", source: src });
  }
  for (const i of sections.interventions ?? []) {
    events.push({ time: (i.time ?? "").slice(0, 5), title: i.intervention, detail: i.response ?? "", source: src });
  }
  if (t?.departScene) events.push({ time: t.departScene.slice(0, 5), title: "Departed scene", detail: t.departScene, source: src });
  return events;
}

/** the record modal from a session's DraftNote, only what the pipeline actually heard */
export function mapSessionToRecord(session: DrillSession): PatientRecord {
  const s: NoteSections = session.epcr?.sections ?? {};
  const v = latestVitals(s);
  const latestNote: ResponderNote = {
    source: `${clock(session.epcrUpdatedAt)} / condensed from the recording${session.epcrStatus === "updating" ? " · updating" : ""}`,
    text: s.conditionObserved ?? s.narrative ?? "Nothing condensed yet.",
  };
  const readings: LabelledValue[] = [
    { label: "Pulse", value: v?.hr ?? "--" },
    { label: "Respiratory rate", value: v?.rr ?? "--" },
    { label: "Blood pressure", value: v?.bp ?? "--" },
    { label: "SpO2", value: v?.spo2 ?? "--" },
    { label: "GCS", value: v?.gcs ?? "---" },
  ];
  return {
    latestNote,
    readings,
    medicalBackground: [
      { label: "Medication list", value: joinList(s.sample?.medications) || joinList(s.medsAndAllergiesMentioned) },
      { label: "Allergies", value: joinList(s.sample?.allergies) || NOT_RECORDED },
      { label: "Relevant past history", value: s.sample?.pastHistory ?? NOT_RECORDED },
    ],
    sceneAccount: [
      { label: "Chief complaint", value: s.chiefComplaint ?? NOT_RECORDED },
      { label: "Found on arrival", value: s.conditionObserved ?? s.physicalExam ?? "--" },
      { label: "Reported mechanism", value: s.mechanismOrComplaint ?? s.sample?.events ?? "--" },
      { label: "Family or witness", value: s.bystanderStatements ?? "--" },
      { label: "Contact number", value: s.familyContact ?? "--" },
    ],
    timeline: timeline(s),
    files: photos(session),
    transcript: mapTranscript(session),
  };
}

export interface NoteFieldOverride {
  suggested: string | null;
  evidence: string[];
  flagged: boolean;
}

/** DraftNote → the review page's ePCR keys. missing in the note = "Not captured" */
export function mapNoteToEpcr(note: DraftNote | undefined): Map<string, NoteFieldOverride> {
  const out = new Map<string, NoteFieldOverride>();
  if (!note) return out;
  const s = note.sections;
  const v = latestVitals(s);
  const evidence = (path: string) => note.spans.find((sp) => sp.field === path)?.transcriptSegmentIds ?? [];
  const flaggedPaths = new Set(note.flags.map((f) => f.ref));
  const set = (key: string, value: string | undefined, path: string) =>
    out.set(key, { suggested: value?.trim() ? value : null, evidence: evidence(path), flagged: flaggedPaths.has(path) });

  const [first, ...rest] = (s.patient?.name ?? "").split(" ");
  set("firstName", first, "sections.patient");
  set("surname", rest.join(" "), "sections.patient");
  set("patientName", s.patient?.name, "sections.patient");
  set("dob", s.patient?.dob, "sections.patient");
  set("sex", s.patient?.sex, "sections.patient");
  set("chiefComplaint", s.chiefComplaint, "sections.chiefComplaint");
  set("timeOfOccurrence", s.opqrst?.time ?? s.incident?.times?.callReceived, "sections.opqrst");
  set("incidentHistory", s.narrative ?? s.timeline, "sections.narrative");
  set("pulse", v?.hr, "sections.vitals");
  set("resp", v?.rr, "sections.vitals");
  set("bp", v?.bp, "sections.vitals");
  set("spo2", v?.spo2, "sections.vitals");
  set("levelOfConsciousness", s.conditionObserved ?? v?.loc, "sections.conditionObserved");
  set("painLocation", s.opqrst?.radiation ?? s.physicalExam, "sections.physicalExam");
  set("headStrike", s.patient?.capacityNote?.toLowerCase().includes("head") ? s.patient.capacityNote : undefined, "sections.patient");
  set("medications", joinList(s.sample?.medications) || joinList(s.medsAndAllergiesMentioned), "sections.sample");
  set("allergies", joinList(s.sample?.allergies), "sections.sample");
  set("pastHistory", s.sample?.pastHistory, "sections.sample");
  set("lastOralIntake", s.sample?.lastOralIntake, "sections.sample");
  set("careAndResponse", s.interventionsPerformed ?? s.interventions?.map((i) => i.intervention).join("; "), "sections.interventionsPerformed");
  set("occurrenceLocation", s.incident?.location, "sections.incident");
  set("dispatchNumber", s.incident?.dispatchReason, "sections.incident");
  set("unit", s.incident?.unitsOnScene, "sections.incident");
  set("crew", s.scene?.othersOnScene, "sections.scene");
  set("handoffTo", s.transport?.handoffTo, "sections.transport");
  set("destination", s.transport?.destination, "sections.transport");
  return out;
}
