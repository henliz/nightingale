import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from "react";
import { incidentReducer, initialIncidentState } from "./reducer";
import type { IncidentAction, IncidentState } from "./types";

const StateContext = createContext<IncidentState | null>(null);
const DispatchContext = createContext<Dispatch<IncidentAction> | null>(null);

const STORAGE_KEY = "medfi.incident.v2";

// story lives in sessionStorage: survives a reload + sign-out/sign-in in the same tab,
// but nothing typed during a demo outlives the tab
function loadState(): IncidentState {
  try {
    localStorage.removeItem("medfi.incident.v1");
    const raw = sessionStorage.getItem(STORAGE_KEY);
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

// the one shared record. persisted so it survives a reload and carries across sign-ins
// (Alvin shares, Rick accepts, same browser)
export function IncidentProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(incidentReducer, undefined, loadState);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable, in-memory state still works */
    }
  }, [state]);

  return (
    <StateContext.Provider value={state}>
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
