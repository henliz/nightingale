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
        <span className={styles.count}>{needle ? `${shown.length} of ${totalCount} records` : `${totalCount} ${totalCount === 1 ? "record" : "records"}`}</span>
      </div>

      <ul className={styles.list} style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {shown.length === 0 && <li className={styles.row}><span className={styles.unit}>No records match “{query.trim()}”.</span></li>}
        {shown.map((record) => (
          <li key={record.captureId ?? record.callId}>
            <button type="button" className={styles.rowButton} onClick={() => onView(record)} aria-label={`View record: ${record.callId}`}>
              <span className={styles.when}>
                <span className={styles.time}>{record.sharedAt}</span>
                <span className={styles.date}>{record.callNumber}</span>
              </span>
              <span className={styles.callColumn}>
                <span className={styles.callId}>{record.captureId || record.demo ? record.callId : `Call ID: ${record.callId}`}</span>
                {/* "truck crash" under "Truck crash" was just noise */}
                {record.unit.toLowerCase() !== record.callId.toLowerCase() && <span className={styles.unit}>{record.unit}</span>}
              </span>
              <span className={styles.patient}>{record.patient ?? ""}</span>
              {/* only what's unusual gets a chip, "draft epcr" on every row was the default */}
              <span className={styles.chips}>
                {record.conflicts ? <span className={styles.conflictChip}>{record.conflicts} to check</span> : null}
                {record.status && record.status !== "Draft ePCR" && <span className={[styles.statusChip, styles.statusQuiet].join(" ")}>{record.status}</span>}
              </span>
              <span className={styles.chevron} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <p className={styles.hint}>Open a call for observations, care timeline, documents and incident details.</p>
    </section>
  );
}
