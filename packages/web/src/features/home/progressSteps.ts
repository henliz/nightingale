import type { Role } from "../../data/users";
import type { Stage } from "../../incident/types";

export interface ProgressStep {
  label: string;
  /** label once the step is reached, if it reads differently (e.g. "Info verified") */
  labelReached?: string;
  /** incident stage where this step lights up */
  reachedAt: Stage;
  /** stage whose recorded time shows under the label */
  timeFrom: Stage;
  /** text shown until a time is recorded */
  placeholder?: string;
}

const FIRE_STEPS: readonly ProgressStep[] = [
  { label: "Call received", reachedAt: "dispatched", timeFrom: "dispatched" },
  { label: "Info collected", reachedAt: "on_scene", timeFrom: "on_scene" },
  { label: "Reviewed", reachedAt: "needs_review", timeFrom: "needs_review" },
  { label: "Shared", reachedAt: "shared", timeFrom: "shared" },
  { label: "Received", reachedAt: "accepted", timeFrom: "received", placeholder: "Confirmed" },
];

const PARAMEDIC_STEPS: readonly ProgressStep[] = [
  { label: "Call received", reachedAt: "dispatched", timeFrom: "dispatched" },
  { label: "Acknowledged record", reachedAt: "accepted", timeFrom: "accepted" },
  { label: "Info verification", labelReached: "Info verified", reachedAt: "verified", timeFrom: "verified" },
  { label: "ED handoff", reachedAt: "received", timeFrom: "received" },
];

export const PROGRESS_STEPS: Record<Role, readonly ProgressStep[]> = {
  firefighter: FIRE_STEPS,
  paramedic: PARAMEDIC_STEPS,
};
