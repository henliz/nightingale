import type { ResponderNote, TranscriptTurn } from "../../../data/record";
import { useLiveSource } from "../../../api/LiveSourceContext";
import styles from "./views.module.css";

interface TranscriptViewProps {
  turns: readonly TranscriptTurn[];
  /** latest observation, shown as a summary above the full transcript */
  latest: ResponderNote;
}

/** summary first, then who said what + when, as the device heard it */
export function TranscriptView({ turns, latest }: TranscriptViewProps) {
  const { partials } = useLiveSource();
  return (
    <div className={styles.view}>
      <h3 className={styles.heading}>Transcript</h3>
      <p className={styles.hint}>Captured by the clip-on device. Voices other than the responder are flagged for review before sharing.</p>
      <div className={styles.summary}>
        <p className={styles.summaryLabel}>Summary · latest observation</p>
        <p className={styles.noteText}>{latest.text}</p>
        <p className={styles.noteSource}>{latest.source} · review before adding to the record</p>
      </div>
      {turns.length === 0 && partials.length === 0 ? (
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
          {partials.map((p) => (
            <li key={p.id} className={[styles.transcriptTurn, styles.transcriptLive].join(" ")} aria-live="polite">
              <span className={styles.eventTime} />
              <span className={styles.speaker}>Hearing…</span>
              <span className={styles.noteText}>{p.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
