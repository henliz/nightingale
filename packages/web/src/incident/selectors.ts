import { EPCR_FIELD_BY_KEY, NOT_CAPTURED, type EpcrField } from "../data/epcr";
import type { FieldReview, IncidentState } from "./types";

export interface ResolvedField {
  field: EpcrField;
  /** What the form shows right now. */
  value: string;
  /** True while no responder has confirmed or cleared the field. */
  unreviewed: boolean;
  /** Red outline: flagged by the pipeline and still unreviewed. */
  flagged: boolean;
  review: FieldReview | undefined;
}

/** The value in the ePCR form once reviews are applied over the suggestion. */
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

/** The nine lines the ER nurse reads first (IMIST-AMBO); the paramedic must fill or confirm them. */
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

/** Required handoff fields that are still empty or flagged and unreviewed. */
export function unfilledHandoffKeys(state: IncidentState): string[] {
  return HANDOFF_REQUIRED_KEYS.filter((key) => {
    const field = EPCR_FIELD_BY_KEY.get(key);
    if (!field) return false;
    const r = resolveField(field, state);
    return r.value === NOT_CAPTURED || r.flagged;
  });
}
