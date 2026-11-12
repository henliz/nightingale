// adult ranges, just enough to say "too high / too low" at a glance (austin, p14).
// not a clinical decision tool, it never hides a value, only tints it
export type VitalKind = "hr" | "rr" | "bp" | "spo2" | "gcs" | "glucose" | "temp" | "text";
export type VitalStatus = "normal" | "low" | "high" | "critical" | "unknown";

export interface Vital {
  kind: VitalKind;
  short: string;
  label: string;
  value: string;
  /** big number, or the word itself when nothing numeric was said */
  display: string;
  unit: string;
  status: VitalStatus;
}

const KIND_BY_LABEL: Record<string, { kind: VitalKind; short: string; unit: string }> = {
  pulse: { kind: "hr", short: "HR", unit: "bpm" },
  "respiratory rate": { kind: "rr", short: "RR", unit: "/min" },
  "blood pressure": { kind: "bp", short: "BP", unit: "mmHg" },
  spo2: { kind: "spo2", short: "SpO₂", unit: "%" },
  gcs: { kind: "gcs", short: "GCS", unit: "/15" },
  glucose: { kind: "glucose", short: "BGL", unit: "mmol/L" },
  temp: { kind: "temp", short: "Temp", unit: "°C" },
  loc: { kind: "text", short: "LOC", unit: "" },
  pain: { kind: "text", short: "Pain", unit: "" },
  skin: { kind: "text", short: "Skin", unit: "" },
};

// the epcr form stores a set as "LOC unresponsive · HR absent · BP 140/84", read it back into readings
const LINE_LABEL: Record<string, string> = { loc: "LOC", hr: "Pulse", rr: "Respiratory rate", bp: "Blood pressure", spo2: "SpO2", gcs: "GCS", temp: "Temp", bgl: "Glucose", pain: "Pain", skin: "Skin" };

export function readingsFromLine(line: string): { label: string; value: string }[] | null {
  const out: { label: string; value: string }[] = [];
  for (const part of line.split(/\s*·\s*/)) {
    const m = /^(LOC|HR|RR|BP|SpO2|GCS|temp|BGL|pain|skin)\s+(.+)$/i.exec(part.trim());
    if (!m) return null;
    out.push({ label: LINE_LABEL[m[1]!.toLowerCase()]!, value: m[2]! });
  }
  return out.length ? out : null;
}

const ABSENT = /\b(absent|none|no pulse|pulseless|apn[oe]ic|not breathing|0)\b/i;
const EMPTY = /^-+$|^$/;

function band(n: number, critLo: number, lo: number, hi: number, critHi: number): VitalStatus {
  if (n <= critLo || n >= critHi) return "critical";
  if (n < lo) return "low";
  if (n > hi) return "high";
  return "normal";
}

export function readVital(label: string, value: string): Vital {
  const meta = KIND_BY_LABEL[label.toLowerCase()] ?? { kind: "text" as const, short: label, unit: "" };
  const v = value.trim();
  const base = { ...meta, label, value: v };
  if (EMPTY.test(v)) return { ...base, display: "--", status: "unknown" };
  if (meta.kind === "text") return { ...base, display: v, status: /\b(unresponsive|absent|apn[oe]ic)\b/i.test(v) ? "critical" : "unknown" };
  if (meta.kind !== "gcs" && ABSENT.test(v)) return { ...base, display: v.split(/[,;(]/)[0]!.trim(), unit: "", status: "critical" };

  if (meta.kind === "bp") {
    const m = /(\d{2,3})\s*\/\s*(\d{2,3})/.exec(v);
    if (!m) return { ...base, display: v, unit: "", status: "unknown" };
    return { ...base, display: `${m[1]}/${m[2]}`, status: band(Number(m[1]), 70, 90, 160, 200) };
  }
  const num = /(\d+(?:\.\d+)?)/.exec(v);
  if (!num) return { ...base, display: v, unit: "", status: "unknown" };
  const n = Number(num[1]);
  const status =
    meta.kind === "hr" ? band(n, 40, 50, 110, 150)
    : meta.kind === "rr" ? band(n, 6, 10, 24, 36)
    : meta.kind === "spo2" ? (n < 88 ? "critical" : n < 94 ? "low" : "normal")
    : meta.kind === "gcs" ? (n <= 8 ? "critical" : n < 15 ? "low" : "normal")
    : meta.kind === "glucose" ? band(n, 2.9, 4, 11, 25)
    : meta.kind === "temp" ? band(n, 32, 35, 38.4, 40.5)
    : "unknown";
  return { ...base, display: num[1]!, status };
}

export const STATUS_WORD: Record<VitalStatus, string> = { normal: "", low: "Low", high: "High", critical: "Critical", unknown: "" };
