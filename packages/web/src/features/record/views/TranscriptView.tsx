import type { ResponderNote, TranscriptTurn } from "../../../data/record";
import styles from "./views.module.css";

interface TranscriptViewProps {
  turns: readonly TranscriptTurn[];
  /** The latest observation, shown as a summary before the full transcript. */
  latest: ResponderNote;
}

/** Summary first, then who said what and when, as the device heard it. */
export function TranscriptView({ turns, latest }: TranscriptViewProps) {
  return (
    <div className={styles.view}>
      <h3 className={styles.heading}>Transcript</h3>
      <p className={styles.hint}>Captured by the clip-on device. Voices other than the responder are flagged for review before sharing.</p>
      <div className={styles.summary}>
        <p className={styles.summaryLabel}>Summary · latest observation</p>
        <p className={styles.noteText}>{latest.text}</p>
        <p className={styles.noteSource}>{latest.source} · review before adding to the record</p>
      </div>
      {turns.length === 0 ? (
        <p className={styles.lede}>No recording yet. The transcript fills in once the device starts capturing on scene.</p>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {turns.map((t, i) => {
            const other = t.speaker !== "Captain";
            return (
              <li key={i} className={styles.transcriptTurn}>
                <span className={styles.eventTime}>{t.time}</span>
                <span className={[styles.speaker, other ? styles.speakerOther : ""].join(" ")}>{t.speaker}</span>
                <span className={styles.noteText}>{t.text}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
