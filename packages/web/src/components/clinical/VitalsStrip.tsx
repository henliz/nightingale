import { readVital, STATUS_WORD } from "../../lib/vitals";
import styles from "./VitalsStrip.module.css";

interface VitalsStripProps {
  readings: readonly { label: string; value: string }[];
  /** when the set was taken, e.g. 20:16:39 */
  at?: string;
  /** inside an epcr field: no heading, no "not said" line */
  bare?: boolean;
}

/** monitor style tiles: big number, unit, tinted when it's out of range */
export function VitalsStrip({ readings, at, bare = false }: VitalsStripProps) {
  const vitals = readings.map((r) => readVital(r.label, r.value));
  const said = vitals.filter((v) => v.kind !== "text");
  // blank tiles were noise, the ones nobody said collapse to one quiet line
  const numeric = said.filter((v) => v.status !== "unknown" || v.display !== "--");
  const unsaid = said.filter((v) => v.status === "unknown" && v.display === "--");
  const words = vitals.filter((v) => v.kind === "text" && v.display !== "--");
  if (numeric.length === 0 && words.length === 0) {
    return (
      <div className={styles.wrap}>
        <span className={styles.title}>Vitals</span>
        <p className={styles.none}>No vitals said out loud yet.</p>
      </div>
    );
  }
  return (
    <div className={styles.wrap}>
      {!bare && (
        <div className={styles.head}>
          <span className={styles.title}>Vitals</span>
          {at && <span className={styles.at}>{at}</span>}
        </div>
      )}
      <dl className={styles.grid}>
        {numeric.map((v) => (
          <div key={v.label} className={[styles.tile, styles[v.status]].join(" ")} title={v.label}>
            <dt className={styles.short}>
              {v.short}
              {STATUS_WORD[v.status] && <span className={styles.flag}>{STATUS_WORD[v.status]}</span>}
            </dt>
            <dd className={styles.value}>
              <span className={/^[\d./]+$/.test(v.display) || v.display === "--" ? styles.num : styles.numWord}>{v.display}</span>
              {v.unit && v.display !== "--" && <span className={styles.unit}>{v.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {!bare && unsaid.length > 0 && <p className={styles.none}>Not said: {unsaid.map((v) => v.short).join(", ")}</p>}
      {words.length > 0 && (
        <dl className={styles.words}>
          {words.map((v) => (
            <div key={v.label} className={[styles.wordRow, v.status === "critical" ? styles.wordCritical : ""].join(" ")}>
              <dt>{v.short}</dt>
              <dd>{v.display}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
