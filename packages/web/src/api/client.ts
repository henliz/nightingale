import { z } from "zod";
import { DrillSession } from "./types";

/** Same-origin prefix; vite proxies it to packages/api in dev, hono serves both in prod. */
export const API_BASE = "/api";

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return schema.parse(await res.json());
}

export function fetchSessions(): Promise<DrillSession[]> {
  return getJson("/dev/sessions", z.array(DrillSession));
}

/** Raw photo or audio bytes for an asset, served by the api from the vault or drill folder. */
export function assetUrl(session: DrillSession, asset: { assetId: string; file?: string }): string {
  if (asset.file) {
    const [sub, name] = asset.file.split("/");
    return `${API_BASE}/dev/files/${encodeURIComponent(session.dir)}/${sub}/${name}`;
  }
  return `${API_BASE}/assets/${asset.assetId}/download`;
}

/**
 * Subscribe to the api's server-sent events. Any event means "something changed";
 * the caller refetches. Returns an unsubscribe function.
 */
export function subscribeToChanges(onChange: () => void, onStatus?: (open: boolean) => void): () => void {
  const source = new EventSource(`${API_BASE}/dev/stream`);
  source.onopen = () => onStatus?.(true);
  source.onerror = () => onStatus?.(false);
  source.onmessage = onChange;
  // the api names its events; listen to the ones that carry record changes
  for (const name of ["asset", "session", "transcript", "epcr", "change"]) source.addEventListener(name, onChange);
  return () => source.close();
}
