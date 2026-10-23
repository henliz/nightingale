import { hasReached, type IncidentState } from "../../incident/types";
import type { ProgressStep } from "./progressSteps";
import styles from "./StageProgress.module.css";

interface StageProgressProps {
  steps: readonly ProgressStep[];
  incident: IncidentState;
}

export function StageProgress({ steps, incident }: StageProgressProps) {
  return (
    <ol className={styles.track} aria-label="Record progress" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {steps.map((step, i) => {
        const reached = hasReached(incident.stage, step.reachedAt);
        const next = steps[i + 1];
        const nextReached = next ? hasReached(incident.stage, next.reachedAt) : false;
        const time = incident.times[step.timeFrom];
        const label = reached && step.labelReached ? step.labelReached : step.label;
        return (
          <li key={step.label} className={styles.stage} aria-current={reached && !nextReached ? "step" : undefined}>
            <div className={styles.marker}>
              <span className={[styles.dot, reached ? styles.dotReached : ""].join(" ")} />
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
