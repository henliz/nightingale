import { Button } from "../../components/ui/Button/Button";
import type { RecordRow } from "../../data/incident";
import styles from "./RecordsList.module.css";

interface RecordsListProps {
  records: readonly RecordRow[];
  totalCount: number;
  /** app bar search text, matches call id, unit or call number */
  query?: string;
  onView: (record: RecordRow) => void;
}

export function RecordsList({ records, totalCount, query = "", onView }: RecordsListProps) {
  const needle = query.trim().toLowerCase();
  const shown = needle ? records.filter((r) => [r.callId, r.unit, r.callNumber].some((v) => v.toLowerCase().includes(needle))) : records;
  return (
    <section className={styles.section} aria-labelledby="records-heading">
      <div className={styles.heading}>
        <h2 id="records-heading" className={styles.title}>
          Records
        </h2>
        <span className={styles.count}>{needle ? `${shown.length} of ${totalCount} records` : `${totalCount} records`}</span>
      </div>

      <ul className={styles.list} style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {shown.length === 0 && <li className={styles.row}><span className={styles.unit}>No records match “{query.trim()}”.</span></li>}
        {shown.map((record) => (
          <li key={record.captureId ?? record.callId} className={styles.row}>
            <div className={styles.callColumn}>
              <span className={styles.callId}>{record.captureId || record.demo ? record.callId : `Call ID: ${record.callId}`}</span>
              <span className={styles.unit}>{record.unit}</span>
            </div>
            <Button variant="ghost" onClick={() => onView(record)}>
              View record
            </Button>
            <div className={styles.meta}>
              <span className={styles.metaRow}>
                <span>{record.captureId ? "Date" : "Call"}</span>
                <span>{record.callNumber}</span>
              </span>
              <span className={styles.metaRow}>
                <span>{record.captureId ? "Recorded" : "Shared"}</span>
                <span>{record.sharedAt}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>

      <p className={styles.hint}>Open a call for observations, care timeline, documents and incident details.</p>
    </section>
  );
}
