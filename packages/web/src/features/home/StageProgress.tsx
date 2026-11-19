import { useLiveSource } from "../../api/LiveSourceContext";
import { hasReached, type IncidentState } from "../../incident/types";
import type { ProgressStep } from "./progressSteps";
import styles from "./StageProgress.module.css";

interface StageProgressProps {
  steps: readonly ProgressStep[];
  incident: IncidentState;
}

export function StageProgress({ steps, incident }: StageProgressProps) {
  // a real call's dispatch time comes from the call itself, the 13:25 is the sample story's
  const live = useLiveSource();
  const dispatchedAt = live.source === "api" && live.call.dispatchAt ? live.call.dispatchAt : incident.times.dispatched;
  return (
    <ol className={styles.track} aria-label="Record progress" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {steps.map((step, i) => {
        const reached = hasReached(incident.stage, step.reachedAt);
        const next = steps[i + 1];
        const nextReached = next ? hasReached(incident.stage, next.reachedAt) : false;
        const time = step.timeFrom === "dispatched" ? dispatchedAt : incident.times[step.timeFrom];
        const label = reached && step.labelReached ? step.labelReached : step.label;
        const current = reached && !nextReached;
        return (
          <li key={step.label} className={styles.stage} aria-current={current ? "step" : undefined}>
            <div className={styles.marker}>
              <span className={[styles.dot, reached ? styles.dotReached : "", current ? styles.dotCurrent : ""].join(" ")}>
                {reached && (
                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M3 7.4l2.6 2.6L11 4.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {next && <span className={[styles.connector, nextReached ? styles.connectorReached : ""].join(" ")} />}
            </div>
            <span className={[styles.label, reached ? styles.labelReached : ""].join(" ")}>{label}</span>
            <span className={styles.time}>{time ?? step.placeholder ?? ""}</span>
          </li>
        );
      })}
    </ol>
  );
}
