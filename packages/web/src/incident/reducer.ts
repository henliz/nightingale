import { hasReached, type IncidentAction, type IncidentState, type Stage } from "./types";

export const initialIncidentState: IncidentState = {
  stage: "dispatched",
  times: { dispatched: "13:25" },
  recordingStartedAt: null,
  lastParamedicUpdate: null,
  observations: [],
  files: [],
  fieldReviews: {},
  qrRevealedAt: null,
  handoffOpenedAt: null,
  handoffReadAt: null,
  dismissedAlertIds: [],
  seenAlertIds: [],
  deletedFileKeys: [],
  incidentNotes: {},
};

/** only ever moves forward, replaying an action is a no-op */
function advance(state: IncidentState, to: Stage, at: string): IncidentState {
  if (hasReached(state.stage, to)) return state;
  return { ...state, stage: to, times: { ...state.times, [to]: at } };
}

export function incidentReducer(state: IncidentState, action: IncidentAction): IncidentState {
  switch (action.type) {
    case "crew_en_route": {
      const next = advance(state, "on_scene", action.at);
      return next === state ? state : { ...next, recordingStartedAt: action.now };
    }
    case "review_started":
      return advance(state, "needs_review", action.at);
    case "review_saved": {
      const next = advance(state, "reviewed", action.at);
      return next === state ? state : { ...next, recordingStartedAt: null };
    }
    case "shared":
      return advance(state, "shared", action.at);
    case "accepted":
      return advance(state, "accepted", action.at);
    case "verify_started":
      return advance(state, "to_verify", action.at);
    case "verified":
      return advance(state, "verified", action.at);
    case "qr_revealed":
      return state.qrRevealedAt ? state : { ...state, qrRevealedAt: action.at };
    case "handoff_opened":
      return state.handoffOpenedAt ? state : { ...state, handoffOpenedAt: action.at };
    case "alerts_dismissed":
      return { ...state, dismissedAlertIds: Array.from(new Set([...state.dismissedAlertIds, ...action.ids])) };
    case "alerts_seen":
      return { ...state, seenAlertIds: Array.from(new Set([...state.seenAlertIds, ...action.ids])) };
    case "file_deleted":
      return { ...state, deletedFileKeys: [...state.deletedFileKeys, action.key] };
    case "incident_note_saved":
      return { ...state, incidentNotes: { ...state.incidentNotes, [action.section]: { text: action.text, by: action.by, at: action.at } } };
    case "handoff_read":
      return state.handoffReadAt ? state : { ...state, handoffReadAt: action.at };
    case "received":
      return advance(state, "received", action.at);
    case "field_reviewed":
      return { ...state, fieldReviews: { ...state.fieldReviews, [action.key]: action.review } };
    case "field_review_cleared":
      return {
        ...state,
        fieldReviews: Object.fromEntries(Object.entries(state.fieldReviews).filter(([key]) => key !== action.key)),
      };
    case "observation_added":
      return { ...state, observations: [...state.observations, action.observation] };
    case "file_added":
      return { ...state, files: [...state.files, action.file] };
    case "paramedic_updated":
      return { ...state, lastParamedicUpdate: action.update };
    case "reset":
      return initialIncidentState;
  }
}
