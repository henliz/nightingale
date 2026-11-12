import type { RecordFile } from "../data/record";

// one tag per photo, from its one-line caption. "mechanism" is the ER word for what caused it
// (bike, tire, stairs, door handle), "scene" is the wider shot. first match wins, unmatched = scene
export type PhotoTag = "Injury" | "Treatment" | "Medications" | "Mechanism" | "Scene" | "Document";

const RULES: [tag: PhotoTag, words: RegExp][] = [
  ["Medications", /\b(pill|medication|medicine|bottle|label|prescription|inhaler|epipen|auto-?injector)\b/i],
  ["Treatment", /\b(oxygen|mask|compression|cpr|aed|pads?|defib|splint|bandage|tourniquet|iv|needle|chest\b.*hands|hands\b.*chest|ventilat|bvm)\b/i],
  ["Injury", /\b(wound|bleed|blood|cut|lacerat|bruis|deform|swell|burn|fracture|injur)\w*/i],
  ["Mechanism", /\b(bike|motorcycle|car|vehicle|truck|tire|tyre|wheel|stairs?|steps|ladder|door|handle|helmet|license plate|plate|knife|railing|pool)\b/i],
];

export const PHOTO_TAGS: readonly PhotoTag[] = ["Scene", "Mechanism", "Injury", "Treatment", "Medications", "Document"];

// a responder can correct the guess, it sticks for this tab's session like the rest of the story
const KEY = (f: RecordFile) => `nightingale.photoTag.${f.name}`;

export function setPhotoTag(f: RecordFile, tag: PhotoTag) {
  try {
    sessionStorage.setItem(KEY(f), tag);
  } catch {
    // private window, the guess stays
  }
}

export function photoTag(f: RecordFile): PhotoTag {
  try {
    const saved = sessionStorage.getItem(KEY(f)) as PhotoTag | null;
    if (saved && PHOTO_TAGS.includes(saved)) return saved;
  } catch {
    // fall through to the guess
  }
  if (!f.url) return "Document";
  return RULES.find(([, re]) => re.test(f.kind))?.[0] ?? "Scene";
}

// handoff page rows (imist-ambo) for each tag, scene shots sit with mechanism
const ROW: Record<PhotoTag, string> = { Injury: "Injuries", Treatment: "Treatment", Medications: "Medications", Mechanism: "Mechanism", Scene: "Mechanism", Document: "Other" };

export function photosByRow(files: readonly RecordFile[]): Map<string, RecordFile[]> {
  const out = new Map<string, RecordFile[]>();
  for (const f of files) {
    if (!f.url) continue;
    const row = ROW[photoTag(f)];
    out.set(row, [...(out.get(row) ?? []), f]);
  }
  return out;
}
