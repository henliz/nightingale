import type { CaptureTurn } from "../data/epcr";

// evidence ids come per section, so "age" was getting "sure, yeah." from the patient section.
// rank by what the line shares with the value (numbers count most), drop filler
const STOP = new Set(["the", "and", "for", "with", "that", "this", "was", "per", "at", "of", "to", "in", "on", "a", "an", "is", "by", "yeah", "okay", "sure"]);

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => (w.length > 2 || /\d/.test(w)) && !STOP.has(w));
}

export function bestEvidence(lines: readonly CaptureTurn[], value: string, note = "", max = 3): CaptureTurn[] {
  const want = new Set(tokens(`${value} ${note}`));
  const scored = lines.map((t, i) => {
    const words = tokens(t.text);
    const score = words.reduce((n, w) => n + (want.has(w) ? (/\d\d/.test(w) ? 3 : /\d/.test(w) ? 0 : 1) : 0), 0);
    return { t, i, score };
  });
  const top = Math.max(0, ...scored.map((s) => s.score));
  // weak one-word overlaps ("dispatch") ride along with a real match, so keep only the strong ones
  const floor = Math.max(1, Math.ceil(top / 2));
  return scored
    .filter((s) => s.score >= floor)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((s) => ({ ...s.t, text: clip(s.t.text, want) }));
}

// long run-on speech gets cut to the bit around the first matching word
function clip(text: string, want: Set<string>, room = 140): string {
  if (text.length <= room) return text;
  const lower = text.toLowerCase();
  const hit = [...want].map((w) => lower.search(new RegExp(`\\b${w}\\b`))).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, hit - room / 2);
  const end = Math.min(text.length, start + room);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}
