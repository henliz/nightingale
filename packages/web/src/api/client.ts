import { z } from "zod";
import { DrillSession } from "./types";

/** same origin, vite proxies it to packages/api in dev */
export const API_BASE = "/api";

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return schema.parse(await res.json());
}

export function fetchSessions(): Promise<DrillSession[]> {
  return getJson("/dev/sessions", z.array(DrillSession));
}

/** raw photo/audio bytes, from the drill folder or the vault */
export function assetUrl(session: DrillSession, asset: { assetId: string; file?: string }): string {
  if (asset.file) {
    const [sub, name] = asset.file.split("/");
    return `${API_BASE}/dev/files/${encodeURIComponent(session.dir)}/${sub}/${name}`;
  }
  return `${API_BASE}/assets/${asset.assetId}/download`;
}

/** words heard so far for an utterance that isn't final yet (`LiveTranscriptEvent` in packages/api) */
export interface PartialLine {
  sessionId: string;
  id: string;
  text: string;
  final: boolean;
  startedAt: number;
}

/** a line from the dev feed, only source + when the server heard it matter here */
export interface FeedLine {
  source: string;
  receivedAt?: number;
  msg: string;
}

interface StreamHandlers {
  /** an asset landed, an ePCR got rebuilt, or a new session started (live.update in packages/api) */
  onChange: () => void;
  onStatus?: (open: boolean) => void;
  /** every new word while someone's talking, and once more when the line is final */
  onPartial?: (line: PartialLine) => void;
  /** pi + server log lines. the last 300 get replayed on connect */
  onLog?: (line: FeedLine) => void;
}

/** listens to the api's live feed, returns an unsubscribe */
export function subscribeToChanges({ onChange, onStatus, onPartial, onLog }: StreamHandlers): () => void {
  const source = new EventSource(`${API_BASE}/dev/stream`);
  source.onopen = () => onStatus?.(true);
  source.onerror = () => onStatus?.(false);
  source.addEventListener("update", onChange);
  // partials fire on every word, so only refetch once a turn is final
  source.addEventListener("transcript", (e) => {
    const line = JSON.parse((e as MessageEvent<string>).data) as PartialLine;
    onPartial?.(line);
    if (line.final) onChange();
  });
  source.addEventListener("log", (e) => onLog?.(JSON.parse((e as MessageEvent<string>).data) as FeedLine));
  return () => source.close();
}

/** same as the dev dashboard's "New session": everything the pi sends from now on goes to a fresh call. the saved cases aren't touched */
export async function startNewCall(): Promise<DrillSession> {
  const res = await fetch(`${API_BASE}/dev/sessions/new`, { method: "POST", headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`/dev/sessions/new → ${res.status}`);
  return DrillSession.parse(await res.json());
}
