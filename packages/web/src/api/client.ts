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

/** calls onChange whenever the api says a session changed, returns an unsubscribe */
export function subscribeToChanges(onChange: () => void, onStatus?: (open: boolean) => void): () => void {
  const source = new EventSource(`${API_BASE}/dev/stream`);
  source.onopen = () => onStatus?.(true);
  source.onerror = () => onStatus?.(false);
  // "update" = an asset landed, an ePCR got rebuilt, or a new session started (live.update in packages/api).
  // live transcript events fire on every partial word, so only refetch once a turn is final
  source.addEventListener("update", onChange);
  source.addEventListener("transcript", (e) => {
    if ((JSON.parse((e as MessageEvent<string>).data) as { final?: boolean }).final) onChange();
  });
  return () => source.close();
}
