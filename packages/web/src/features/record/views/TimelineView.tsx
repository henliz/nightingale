import { Button } from "../../../components/ui/Button/Button";
import type { TimelineEvent } from "../../../data/record";
import styles from "./views.module.css";

interface TimelineViewProps {
  events: readonly TimelineEvent[];
  onAddObservation: () => void;
  onViewFiles: () => void;
}

// what kind of moment it is, from the title. drives the dot on the rail
function kind(title: string): "call" | "vitals" | "care" | "handoff" {
  const t = title.toLowerCase();
  if (/call received|on scene|first contact|departed/.test(t)) return "call";
  if (/observation|vital/.test(t)) return "vitals";
  if (/transfer|handoff|shared|received/.test(t)) return "handoff";
  return "care";
}

export function TimelineView({ events, onAddObservation, onViewFiles }: TimelineViewProps) {
  return (
    <div className={styles.view}>
      <div className={styles.headingRow}>
        <h3 className={styles.heading}>Care timeline</h3>
        <span className={styles.spacer} />
        <span className={styles.legend}>
          <span className={[styles.legendDot, styles.kcall].join(" ")} />Call
          <span className={[styles.legendDot, styles.kvitals].join(" ")} />Vitals
          <span className={[styles.legendDot, styles.kcare].join(" ")} />Care
          <span className={[styles.legendDot, styles.khandoff].join(" ")} />Handoff
        </span>
      </div>
      {events.length === 0 ? (
        <p className={styles.lede}>Nothing recorded yet. Events appear here as the crew captures them on scene.</p>
      ) : (
        <ol className={styles.events} style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {events.map((e, i) => (
            <li key={`${e.time}-${i}`} className={styles.event}>
              <span className={styles.eventTime}>{e.time}</span>
              <span className={[styles.eventDot, styles[`k${kind(e.title)}`]].join(" ")} aria-hidden="true" />
              <div className={styles.eventBody}>
                <span className={styles.eventTitle}>{e.title}</span>
                {e.detail && <span className={styles.eventDetail}>{e.detail}</span>}
              </div>
              <span className={styles.eventSource}>{e.source}</span>
            </li>
          ))}
        </ol>
      )}
      <div className={styles.actions}>
        <Button onClick={onAddObservation}>Add observation</Button>
        <Button variant="ghostInk" onClick={onViewFiles}>
          View documents and images
        </Button>
      </div>
    </div>
  );
}
