import { EPCR_FIELD_BY_KEY, NOT_CAPTURED, type EpcrField } from "../data/epcr";
import type { FieldReview, IncidentState } from "./types";

export interface ResolvedField {
  field: EpcrField;
  /** what the form shows right now */
  value: string;
  /** true until a responder confirms or clears the field */
  unreviewed: boolean;
  /** red outline: pipeline flagged it and nobody's reviewed it yet */
  flagged: boolean;
  review: FieldReview | undefined;
}

/** the ePCR form value once reviews are applied over the suggestion */
export function resolveField(field: EpcrField, state: IncidentState): ResolvedField {
  const review = state.fieldReviews[field.key];
  const value = review ? review.value : (field.suggested ?? "");
  return {
    field,
    value: field.kind === "checkbox" ? value : value || NOT_CAPTURED,
    unreviewed: !review,
    flagged: Boolean(field.flagged) && !review,
    review,
  };
}

/** the nine lines the ER nurse reads first (IMIST-AMBO), paramedic has to fill or confirm them */
export const HANDOFF_REQUIRED_KEYS: readonly string[] = [
  "dob",
  "mailingAddress",
  "allergies",
  "medications",
  "pastHistory",
  "headStrike",
  "spo2",
  "lastOralIntake",
  "handoffTo",
];

/** required handoff fields still empty or flagged + unreviewed */
export function unfilledHandoffKeys(state: IncidentState): string[] {
  return HANDOFF_REQUIRED_KEYS.filter((key) => {
    const field = EPCR_FIELD_BY_KEY.get(key);
    if (!field) return false;
    const r = resolveField(field, state);
    return r.value === NOT_CAPTURED || r.flagged;
  });
}
