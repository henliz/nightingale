// saves every drill session to disk so a test can be reviewed after the fact, and so
// restarting the api doesn't wipe the dashboard. one folder per device connection
// (= one device session id), under <repo>/drills/ by default:
//
//   drills/2026-10-17_18-36-03_session_1792276563/
//     session.json    everything the dashboard shows (assets, transcripts, epcr)
//     transcript.md   the running transcript, readable
//     epcr.md         the latest draft epcr + photo captions, readable
//     console.log     device + server log lines for this session
//     photos/  audio/ the raw captures
//
// fictional drill data only (ARCHITECTURE.md scope note). this is a dev convenience,
// not the sealed vault, no retention rules, no access control

import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type { DraftNote } from "@nightingale/schema";
import type { LiveLogLine } from "./live.js";

export interface LiveAsset {
  assetId: string;
  /** authenticated actor that uploaded this asset; used for post-restart access checks */
  ownerActorId?: string;
  captureId: string;
  kind: "audio" | "photo";
  completedAt: number;
  /** "live": the live stream already transcribed this stretch, no batch pass needed */
  status: "processing" | "ready" | "failed" | "silent" | "live";
  /** when the device started recording this chunk (unix ms), if it said */
  capturedAt?: number;
  levelDbfs?: number;
  /** speaker-labelled lines, `at` = when that line started (unix ms, server clock) */
  transcript?: { speaker: string; text: string; nonResponder?: boolean; at?: number }[];
  durationMs?: number;
  note?: DraftNote;
  caption?: string;
  /** path of the raw capture inside the session folder, e.g. photos/183607_ab12cd34.jpg */
  file?: string;
}

/** one utterance from the live (word-by-word) transcription, saved once final */
export interface LiveTurn {
  id: string;
  startedAt: number;
  endedAt: number;
  text: string;
}

export interface DrillSession {
  captureId: string;
  /** folder name under the drills root */
  dir: string;
  deviceId?: string;
  startedAt: number;
  assets: LiveAsset[];
  /** audio from an earlier boot that was still queued on the pi, uploaded late */
  backlog?: boolean;
  /** started with the dashboard's new call button, so it's a call even if nobody talks */
  fromNewCall?: boolean;
  /** a name for the dropdown, e.g. "Case 2 · Shellfish allergy" (scripts/split-cases.mjs) */
  title?: string;
  /** the recording a case was split out of */
  caseOf?: string;
  /** the session-wide draft epcr, rebuilt from the whole transcript after every chunk */
  epcr?: DraftNote;
  epcrStatus?: "updating" | "ready" | "failed";
  epcrUpdatedAt?: number;
  epcrChunks?: number;
  liveTurns?: LiveTurn[];
  /** "Person 1", "Person 2", ... in the order they were first heard */
  speakers?: string[];
  /** set when this session was started from the dashboard's "new session" button: the
   * device session it split off from. data from that device after startedAt lands here */
  deviceSessionId?: string;
  /** [start, end] unix ms spans when the live stream was connected */
  liveCoverage?: [number, number][];
}

export interface DrillStore {
  load(): DrillSession[];
  saveSession(session: DrillSession): void;
  saveFile(session: DrillSession, relPath: string, bytes: Uint8Array): void;
  appendLog(session: DrillSession, line: LiveLogLine): void;
  /** absolute path of a file inside a session folder, or null if it'd escape it */
  resolveFile(dir: string, relPath: string): string | null;
}

// tests and anything else that doesn't want files on disk
export const noopDrillStore: DrillStore = {
  load: () => [],
  saveSession: () => {},
  saveFile: () => {},
  appendLog: () => {},
  resolveFile: () => null,
};

const pad = (n: number) => String(n).padStart(2, "0");

export function sessionDirName(captureId: string, startedAt: number) {
  const d = new Date(startedAt);
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `${stamp}_${captureId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function clockStamp(ms: number) {
  const d = new Date(ms);
  return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function createFsDrillStore(root: string): DrillStore {
  const rootAbs = resolve(root);
  mkdirSync(rootAbs, { recursive: true, mode: 0o700 });
  chmodSync(rootAbs, 0o700);
  const pending = new Map<string, NodeJS.Timeout>();

  const writeNow = (session: DrillSession) => {
    const dir = join(rootAbs, session.dir);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    writeFileSync(join(dir, "session.json"), JSON.stringify(session, null, 2), { mode: 0o600 });
    writeFileSync(join(dir, "transcript.md"), transcriptMarkdown(session), { mode: 0o600 });
    writeFileSync(join(dir, "epcr.md"), epcrMarkdown(session), { mode: 0o600 });
  };

  return {
    load() {
      if (!existsSync(rootAbs)) return [];
      const sessions: DrillSession[] = [];
      for (const name of readdirSync(rootAbs)) {
        const file = join(rootAbs, name, "session.json");
        if (!existsSync(file)) continue;
        try {
          const session = JSON.parse(readFileSync(file, "utf8")) as DrillSession;
          session.dir = name;
          sessions.push(session);
        } catch (err) {
          console.error(`couldn't read ${file}, skipping it:`, err);
        }
      }
      return sessions;
    },
    // debounced, a chunk landing fires a few updates in a row
    saveSession(session) {
      clearTimeout(pending.get(session.captureId));
      pending.set(
        session.captureId,
        setTimeout(() => {
          pending.delete(session.captureId);
          try {
            writeNow(session);
          } catch (err) {
            console.error(`couldn't save drill session ${session.captureId}:`, err);
          }
        }, 300),
      );
    },
    saveFile(session, relPath, bytes) {
      const target = this.resolveFile(session.dir, relPath);
      if (!target) return;
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes, { mode: 0o600 });
      chmodSync(target, 0o600);
    },
    appendLog(session, line) {
      const dir = join(rootAbs, session.dir);
      mkdirSync(dir, { recursive: true });
      const ts = new Date(line.ts).toLocaleTimeString();
      appendFileSync(join(dir, "console.log"), `${ts} ${line.source} ${line.level}: ${line.msg}\n`, { mode: 0o600 });
      chmodSync(join(dir, "console.log"), 0o600);
    },
    resolveFile(dir, relPath) {
      const sessionDir = resolve(rootAbs, dir);
      const target = resolve(sessionDir, relPath);
      if (!sessionDir.startsWith(rootAbs + sep) || !target.startsWith(sessionDir + sep)) return null;
      return target;
    },
  };
}

// ---- readable copies, so a test can be reviewed without the dashboard ----

const time = (ms: number) => new Date(ms).toLocaleTimeString();

export function transcriptMarkdown(session: DrillSession) {
  const lines = [
    `# transcript, ${session.title ?? session.captureId}`,
    "",
    `device ${session.deviceId ?? "unknown"}, started ${new Date(session.startedAt).toLocaleString()}`,
    "",
    "_speaker-labelled lines come from the saved chunks (Person 1, 2, ... = order voices were first heard). lines without a speaker are from the live stream and weren't labelled yet. silence isn't listed._",
    "",
  ];
  const entries = transcriptEntries(session);
  if (!entries.length) lines.push("_nothing said yet_");
  for (const e of entries) {
    lines.push(`**${time(e.at)}** ${e.speaker ?? "(live, speaker not labelled yet)"}${e.file ? ` ([audio](${e.file}))` : ""}  `);
    lines.push(e.text, "");
  }
  return lines.join("\n");
}

export interface TranscriptEntry {
  at: number;
  text: string;
  /** "live": words as they were said, no speaker yet. "labelled": the same stretch once
   * the saved chunk came back with speaker labels, which replaces the live lines */
  source: "live" | "labelled";
  speaker?: string;
  file?: string;
}

/** labelled chunk lines, plus live lines for any stretch not labelled yet, in time order */
export function transcriptEntries(session: DrillSession): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const labelled: [number, number][] = [];
  for (const a of session.assets) {
    if (a.kind !== "audio" || a.status !== "ready" || !a.transcript) continue;
    const start = a.capturedAt ?? a.completedAt;
    labelled.push([start, start + (a.durationMs ?? 30000)]);
    // back-to-back lines from the same voice read better as one
    for (const seg of a.transcript) {
      const last = entries.at(-1);
      const text = seg.nonResponder ? `${seg.text} [non-responder, review]` : seg.text;
      if (last && last.source === "labelled" && last.speaker === seg.speaker && last.file === a.file) last.text += ` ${text}`;
      else entries.push({ at: seg.at ?? start, text, source: "labelled", speaker: seg.speaker, file: a.file });
    }
  }
  for (const t of session.liveTurns ?? []) {
    if (!t.text || labelled.some(([s, e]) => t.startedAt >= s && t.startedAt < e)) continue;
    entries.push({ at: t.startedAt, text: t.text, source: "live" });
  }
  return entries.sort((x, y) => x.at - y.at);
}

const LABELS: Record<string, string> = {
  incident: "Incident",
  location: "Location",
  dispatchReason: "Dispatch reason",
  unitsOnScene: "Units on scene",
  times: "Times",
  callReceived: "Call received",
  enRoute: "En route",
  onScene: "On scene",
  patientContact: "Patient contact",
  departScene: "Depart scene",
  atDestination: "At destination",
  scene: "Scene",
  numberOfPatients: "Number of patients",
  environment: "Environment",
  safety: "Safety",
  othersOnScene: "Others on scene",
  patient: "Patient",
  capacityNote: "Capacity reason",
  decisionMaker: "Decision maker",
  chiefComplaint: "Chief complaint",
  mechanismOrComplaint: "Mechanism / what happened",
  timeline: "Timeline",
  sample: "SAMPLE history",
  signsSymptoms: "Signs / symptoms",
  allergies: "Allergies",
  medications: "Medications",
  pastHistory: "Past history",
  lastOralIntake: "Last oral intake",
  events: "Events leading up",
  opqrst: "OPQRST",
  conditionObserved: "Condition observed",
  physicalExam: "Physical exam",
  interventionsPerformed: "Interventions (summary)",
  medsAndAllergiesMentioned: "Meds / allergies mentioned",
  hazards: "Hazards",
  bystanderStatements: "Bystander statements",
  belongings: "Belongings",
  familyContact: "Family contact",
  transport: "Transport",
  narrative: "Narrative",
};

function valueLines(value: unknown, depth: number): string[] {
  const indent = "  ".repeat(depth);
  if (Array.isArray(value)) {
    return value.map((v) =>
      typeof v === "object" && v
        ? `${indent}- ${Object.entries(v).map(([k, x]) => `${k}: ${x}`).join(", ")}`
        : `${indent}- ${v}`,
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) =>
      typeof v === "object" && v
        ? [`${indent}- **${LABELS[k] ?? k}:**`, ...valueLines(v, depth + 1)]
        : [`${indent}- **${LABELS[k] ?? k}:** ${v}`],
    );
  }
  return [`${indent}${value}`];
}

export function epcrMarkdown(session: DrillSession) {
  const lines = [`# draft ePCR, ${session.title ?? session.captureId}`, "", "_draft, pending responder review. ai-generated from the transcript, nothing here is approved._", ""];
  const epcr = session.epcr;
  if (!epcr) lines.push("_no epcr yet_", "");
  else {
    lines.push(`updated ${epcr ? time(session.epcrUpdatedAt ?? Date.now()) : ""} from ${session.epcrChunks ?? "?"} chunk(s), model ${epcr.modelVersion}, prompt ${epcr.promptVersion}`, "");
    for (const [field, value] of Object.entries(epcr.sections)) {
      if (field === "vitals" && Array.isArray(value)) {
        lines.push("## Vitals", "", "| time | LOC | BP | HR | RR | SpO2 | GCS | temp | glucose | pain | skin |", "|---|---|---|---|---|---|---|---|---|---|---|");
        for (const v of value as Record<string, string>[]) {
          lines.push(`| ${["time", "loc", "bp", "hr", "rr", "spo2", "gcs", "temp", "glucose", "pain", "skin"].map((k) => v[k] ?? "").join(" | ")} |`);
        }
        lines.push("");
      } else if (field === "interventions" && Array.isArray(value)) {
        lines.push("## Interventions", "", "| time | intervention | response |", "|---|---|---|");
        for (const v of value as Record<string, string>[]) lines.push(`| ${v.time ?? ""} | ${v.intervention ?? ""} | ${v.response ?? ""} |`);
        lines.push("");
      } else {
        lines.push(`## ${LABELS[field] ?? field}`, "", ...valueLines(value, 0), "");
      }
    }
    if (epcr.flags.length) {
      lines.push("## Needs review", "", ...epcr.flags.map((f) => `- ${f.type.replace(/_/g, " ")}${f.note ? `: ${f.note}` : ""}`), "");
    }
  }
  const photos = session.assets.filter((a) => a.kind === "photo").sort((x, y) => x.completedAt - y.completedAt);
  if (photos.length) {
    lines.push("## Scene photos", "");
    for (const p of photos) lines.push(`- ${time(p.completedAt)}: ${p.caption ?? "(no caption)"}${p.file ? ` ([photo](${p.file}))` : ""}`);
    lines.push("");
  }
  return lines.join("\n");
}
