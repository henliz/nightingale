import { createContext, useCallback, useContext, useEffect, useState, type Dispatch, type ReactNode } from "react";
import { useLiveSource } from "../api/LiveSourceContext";
import { incidentReducer, initialIncidentState } from "./reducer";
import type { IncidentAction, IncidentState } from "./types";

const StateContext = createContext<IncidentState | null>(null);
const DispatchContext = createContext<Dispatch<IncidentAction> | null>(null);

const STORAGE_PREFIX = "medfi.incident.v3.";

// story lives in sessionStorage: survives a reload + sign-out/sign-in in the same tab,
// but nothing typed during a demo outlives the tab
function loadState(storageKey: string): IncidentState {
  try {
    localStorage.removeItem("medfi.incident.v1");
    sessionStorage.removeItem("medfi.incident.v2");
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return initialIncidentState;
    const parsed = JSON.parse(raw) as Partial<IncidentState>;
    // older saved shapes might be missing the list fields, never trust storage for arrays
    return {
      ...initialIncidentState,
      ...parsed,
      observations: Array.isArray(parsed.observations) ? parsed.observations : [],
      files: Array.isArray(parsed.files) ? parsed.files : [],
      fieldReviews: parsed.fieldReviews && typeof parsed.fieldReviews === "object" ? parsed.fieldReviews : {},
      dismissedAlertIds: Array.isArray(parsed.dismissedAlertIds) ? parsed.dismissedAlertIds : [],
      seenAlertIds: Array.isArray(parsed.seenAlertIds) ? parsed.seenAlertIds : [],
      deletedFileKeys: Array.isArray(parsed.deletedFileKeys) ? parsed.deletedFileKeys : [],
      incidentNotes: parsed.incidentNotes && typeof parsed.incidentNotes === "object" ? parsed.incidentNotes : {},
    };
  } catch {
    return initialIncidentState;
  }
}

// one story per call (each case, the sample call, a live one), so reviews on case 1 never
// show up on case 2. persisted so it survives a reload and carries across sign-ins
// (Alvin shares, Rick accepts, same browser)
export function IncidentProvider({ children }: { children: ReactNode }) {
  const live = useLiveSource();
  const storageKey = STORAGE_PREFIX + (live.source === "demo" ? "sample" : (live.session?.captureId ?? "none"));
  const [store, setStore] = useState(() => ({ key: storageKey, state: loadState(storageKey) }));
  // switched calls: load that call's story (state adjusted during render, no effect)
  if (store.key !== storageKey) setStore({ key: storageKey, state: loadState(storageKey) });

  const dispatch = useCallback<Dispatch<IncidentAction>>((action) => setStore((s) => ({ ...s, state: incidentReducer(s.state, action) })), []);

  useEffect(() => {
    try {
      sessionStorage.setItem(store.key, JSON.stringify(store.state));
    } catch {
      /* storage unavailable, in-memory state still works */
    }
  }, [store]);

  return (
    <StateContext.Provider value={store.state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useIncident(): IncidentState {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error("useIncident must be used inside <IncidentProvider>");
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useIncidentDispatch(): Dispatch<IncidentAction> {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error("useIncidentDispatch must be used inside <IncidentProvider>");
  return ctx;
}
