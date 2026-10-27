import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { CaptureExcerpt } from "../data/epcr";
import type { PatientRecord } from "../data/record";
import { callInfo, SAMPLE_CALL, type CallInfo } from "./call";
import { fetchSessions, startNewCall, subscribeToChanges, type PartialLine } from "./client";
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
  /** live feed open, null until the first try */
  feedOpen: boolean | null;
  /** the last pi we heard from (heartbeat every 30s) and when, by the server's clock */
  device: { id: string; lastHeard: number } | null;
  /** words being said right now on the call on screen, not saved as a line yet */
  partials: PartialLine[];
  /** fresh call for whatever the pi records next, then follows it. the saved cases stay as they are */
  startNewCall: () => Promise<void>;
}

const LiveSourceContext = createContext<LiveSourceValue | null>(null);

const SOURCE_KEY = "nightingale.source";
const SESSION_KEY = "nightingale.source.session";

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
  const [feedOpen, setFeedOpen] = useState<boolean | null>(null);
  const [device, setDevice] = useState<LiveSourceValue["device"]>(null);
  const [partials, setPartials] = useState<Record<string, PartialLine>>({});
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
    const unsubscribe = subscribeToChanges({
      onChange: () => void load(),
      onStatus: (open) => {
        setFeedOpen(open);
        // the feed reconnects on its own, so an api that was down (or still booting) shows its calls the moment it's back
        if (open) void load();
      },
      onPartial: (line) =>
        setPartials((prev) => {
          const next = { ...prev };
          // the saved line comes in with the refetch
          if (line.final) delete next[line.id];
          else next[line.id] = line;
          return next;
        }),
      onLog: (line) => {
        if (line.source === "server") return;
        const heard = line.receivedAt ?? Date.now();
        setDevice((prev) => (prev && prev.lastHeard >= heard ? prev : { id: line.source, lastHeard: heard }));
      },
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const session = source === "api" ? pickSession(sessions, wanted) : null;

  const selectSession = (captureId: string | null) => {
    setWanted(captureId);
    try {
      if (captureId) sessionStorage.setItem(SESSION_KEY, captureId);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable */
    }
  };
  const setSource = (next: DataSource) => {
    if (next === source) return;
    setSourceState(next);
    try {
      sessionStorage.setItem(SOURCE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  };

  const value: LiveSourceValue = {
    source,
    status,
    error,
    sessions,
    session,
    call: source === "demo" ? SAMPLE_CALL : callInfo(session),
    pinned: wanted,
    selectSession,
    setSource,
    record: session ? mapSessionToRecord(session) : null,
    excerpts: session ? mapExcerpts(session) : null,
    feedOpen,
    device,
    partials: session ? Object.values(partials).filter((p) => p.sessionId === session.captureId).sort((a, b) => a.startedAt - b.startedAt) : [],
    startNewCall: async () => {
      const fresh = await startNewCall();
      setSource("api");
      // pin it so a late upload from the old call can't pull the screen back
      selectSession(fresh.captureId);
      setSessions((prev) => [...prev.filter((s) => s.captureId !== fresh.captureId), fresh]);
    },
  };

  return <LiveSourceContext.Provider value={value}>{children}</LiveSourceContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLiveSource(): LiveSourceValue {
  const ctx = useContext(LiveSourceContext);
  if (!ctx) throw new Error("useLiveSource must be used inside <LiveSourceProvider>");
  return ctx;
}
