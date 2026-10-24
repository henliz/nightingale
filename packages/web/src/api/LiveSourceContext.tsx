import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { CaptureExcerpt } from "../data/epcr";
import type { PatientRecord } from "../data/record";
import { callInfo, SAMPLE_CALL, type CallInfo } from "./call";
import { fetchSessions, subscribeToChanges } from "./client";
import { mapExcerpts, mapSessionToRecord, sortedSessions } from "./mapNote";
import type { DrillSession } from "./types";

export type DataSource = "demo" | "api";

interface LiveSourceValue {
  source: DataSource;
  status: "loading" | "ready" | "error";
  error: string | null;
  sessions: DrillSession[];
  session: DrillSession | null;
  /** what every card and dialog says about the call on screen, real or the sample */
  call: CallInfo;
  /** null = unpin, follow the newest call */
  selectSession: (captureId: string | null) => void;
  /** null when following the newest call */
  pinned: string | null;
  setSource: (source: DataSource) => void;
  /** what the record modal shows when a session is selected, null in demo mode */
  record: PatientRecord | null;
  excerpts: CaptureExcerpt[] | null;
}

const LiveSourceContext = createContext<LiveSourceValue | null>(null);

const SOURCE_KEY = "medfi.source";
const SESSION_KEY = "medfi.source.session";

/** real calls by default. the sample call is one of the records, picking it flips to "demo" for the tab */
function readSource(): DataSource {
  try {
    if (sessionStorage.getItem(SOURCE_KEY) === "demo") return "demo";
  } catch {
    /* storage unavailable */
  }
  return "api";
}

function pickSession(sessions: DrillSession[], wanted: string | null): DrillSession | null {
  const byId = wanted ? sessions.find((s) => s.captureId === wanted) : undefined;
  // nothing pinned = follow whatever call is newest, so a fresh one from the pi shows up on its own
  return byId ?? sortedSessions(sessions)[0] ?? null;
}

export function LiveSourceProvider({ children }: { children: ReactNode }) {
  const [source, setSourceState] = useState<DataSource>(readSource);
  const [status, setStatus] = useState<LiveSourceValue["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<DrillSession[]>([]);
  const [wanted, setWanted] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  });

  // always loaded, even on the sample call, so the records list can switch back to a real one
  useEffect(() => {
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
  }, []);

  const session = source === "api" ? pickSession(sessions, wanted) : null;

  const value: LiveSourceValue = {
    source,
    status,
    error,
    sessions,
    session,
    call: source === "demo" ? SAMPLE_CALL : callInfo(session),
    pinned: wanted,
    selectSession: (captureId) => {
      setWanted(captureId);
      try {
        if (captureId) sessionStorage.setItem(SESSION_KEY, captureId);
        else sessionStorage.removeItem(SESSION_KEY);
      } catch {
        /* storage unavailable */
      }
    },
    setSource: (next) => {
      if (next === source) return;
      setSourceState(next);
      try {
        sessionStorage.setItem(SOURCE_KEY, next);
      } catch {
        /* storage unavailable */
      }
    },
    record: session ? mapSessionToRecord(session) : null,
    excerpts: session ? mapExcerpts(session) : null,
  };

  return <LiveSourceContext.Provider value={value}>{children}</LiveSourceContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLiveSource(): LiveSourceValue {
  const ctx = useContext(LiveSourceContext);
  if (!ctx) throw new Error("useLiveSource must be used inside <LiveSourceProvider>");
  return ctx;
}
