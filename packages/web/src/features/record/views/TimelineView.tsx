import { Button } from "../../../components/ui/Button/Button";
import type { TimelineEvent } from "../../../data/record";
import styles from "./views.module.css";

interface TimelineViewProps {
  events: readonly TimelineEvent[];
  onAddObservation: () => void;
  onViewFiles: () => void;
}

export function TimelineView({ events, onAddObservation, onViewFiles }: TimelineViewProps) {
  return (
    <div className={styles.view}>
      <h3 className={styles.heading}>Care timeline</h3>
      <p className={styles.hint}>Time of observation or care, with the source kept alongside.</p>
      {events.length === 0 ? (
        <p className={styles.lede}>Nothing recorded yet. Events appear here as the crew captures them on scene.</p>
      ) : (
        <ol className={styles.events} style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {events.map((e, i) => (
            <li key={`${e.time}-${i}`} className={styles.event}>
              <span className={styles.eventTime}>{e.time}</span>
              <div className={styles.eventBody}>
                <span className={styles.eventTitle}>{e.title}</span>
                <span className={styles.eventDetail}>{e.detail}</span>
                <span className={styles.eventSource}>{e.source}</span>
              </div>
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
