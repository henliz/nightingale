import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { CaptureExcerpt } from "../data/epcr";
import type { PatientRecord } from "../data/record";
import { fetchSessions, subscribeToChanges } from "./client";
import { mapExcerpts, mapNoteToEpcr, mapSessionToRecord, type NoteFieldOverride } from "./mapNote";
import type { DrillSession } from "./types";

export type DataSource = "demo" | "api";

interface LiveSourceValue {
  source: DataSource;
  /** "idle" in demo mode, otherwise where the api connection is at */
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  sessions: DrillSession[];
  session: DrillSession | null;
  selectSession: (captureId: string) => void;
  /** what the record modal shows when a session is selected, null in demo mode */
  record: PatientRecord | null;
  excerpts: CaptureExcerpt[] | null;
  epcr: Map<string, NoteFieldOverride> | null;
}

const LiveSourceContext = createContext<LiveSourceValue | null>(null);

const SOURCE_KEY = "medfi.source";
const SESSION_KEY = "medfi.source.session";

/** `?source=api` (or demo) sticks for the tab, else VITE_DATA_SOURCE, else demo */
function readSource(): DataSource {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("source");
    if (fromUrl === "api" || fromUrl === "demo") {
      sessionStorage.setItem(SOURCE_KEY, fromUrl);
      return fromUrl;
    }
    const stored = sessionStorage.getItem(SOURCE_KEY);
    if (stored === "api" || stored === "demo") return stored;
  } catch {
    /* storage unavailable */
  }
  return import.meta.env.VITE_DATA_SOURCE === "api" ? "api" : "demo";
}

function pickSession(sessions: DrillSession[], wanted: string | null): DrillSession | null {
  const byId = wanted ? sessions.find((s) => s.captureId === wanted) : undefined;
  if (byId) return byId;
  // named cases (split out of drills, e.g. "Case 3 · dirt bike femur") first, then the newest ePCR
  const withEpcr = [...sessions].filter((s) => s.epcr).sort((a, b) => b.startedAt - a.startedAt);
  return withEpcr.find((s) => s.title) ?? withEpcr[0] ?? sessions[0] ?? null;
}

export function LiveSourceProvider({ children }: { children: ReactNode }) {
  const [source] = useState<DataSource>(readSource);
  const [status, setStatus] = useState<LiveSourceValue["status"]>(source === "api" ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<DrillSession[]>([]);
  const [wanted, setWanted] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (source !== "api") return;
    let cancelled = false;
    async function load() {
      try {
        const list = await fetchSessions();
        if (cancelled) return;
        setSessions(list);
        setStatus("ready");
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    void load();
    const unsubscribe = subscribeToChanges(() => void load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [source]);

  const session = source === "api" ? pickSession(sessions, wanted) : null;

  const value: LiveSourceValue = {
    source,
    status,
    error,
    sessions,
    session,
    selectSession: (captureId) => {
      setWanted(captureId);
      try {
        sessionStorage.setItem(SESSION_KEY, captureId);
      } catch {
        /* storage unavailable */
      }
    },
    record: session ? mapSessionToRecord(session) : null,
    excerpts: session ? mapExcerpts(session) : null,
    epcr: session ? mapNoteToEpcr(session.epcr) : null,
  };

  return <LiveSourceContext.Provider value={value}>{children}</LiveSourceContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLiveSource(): LiveSourceValue {
  const ctx = useContext(LiveSourceContext);
  if (!ctx) throw new Error("useLiveSource must be used inside <LiveSourceProvider>");
  return ctx;
}
