import type { DraftNote } from "@nightingale/schema";

export interface FactRecallResult {
  recalled: string[];
  missed: string[];
  score: number;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function noteText(note: DraftNote): string {
  return normalize(JSON.stringify(note.sections));
}

// not nlp, just string matching, this is a stand in evaluation harness for the fake
// adapters (ARCHITECTURE.md section 8). once a real transcriber + condenser exist
// (milestone 8) this is the spot to add word error rate against hand written transcripts
const STOPWORDS = new Set(["approximately", "fictional", "mentioned", "unconfirmed", "reported"]);

// a planted fact looks like "medication mentioned: apixaban (blood thinner)". we only
// care about what's after the colon, the label before it is just drill protocol bookkeeping
function distinctiveWords(fact: string): string[] {
  const value = fact.includes(":") ? fact.slice(fact.indexOf(":") + 1) : fact;
  return normalize(value)
    .split(" ")
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
}

export function factRecallScore(note: DraftNote, plantedFacts: string[]): FactRecallResult {
  const haystack = noteText(note);
  const recalled: string[] = [];
  const missed: string[] = [];

  for (const fact of plantedFacts) {
    const words = distinctiveWords(fact);
    const found = words.length > 0 && words.some((word) => haystack.includes(word));
    (found ? recalled : missed).push(fact);
  }

  return {
    recalled,
    missed,
    score: plantedFacts.length === 0 ? 1 : recalled.length / plantedFacts.length,
  };
}
