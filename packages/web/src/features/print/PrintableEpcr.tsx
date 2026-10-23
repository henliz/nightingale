import { CAPTURE_META } from "../../data/epcr";
import { CURRENT_CALL } from "../../data/incident";
import { PATIENT } from "../../data/record";
import type { IncidentState } from "../../incident/types";
import { buildPrintLayout, type PrintBlock } from "./printLayout";
import styles from "./PrintableEpcr.module.css";

interface PrintableEpcrProps {
  incident: IncidentState;
  /** Version number so the hospital can tell copies apart. */
  version: number;
}

/** One Letter page of the ePCR, laid out like the paper on-scene sheet. */
export function PrintableEpcr({ incident, version }: PrintableEpcrProps) {
  const layout = buildPrintLayout(incident);
  const reviewed = incident.stage !== "dispatched" && incident.stage !== "on_scene" && incident.stage !== "needs_review";

  return (
    <article className={styles.page} aria-label="Printable ePCR">
      <div className={styles.identity}>
        <p className={styles.identityTitle}>Electronic Patient Care Record</p>
        <p className={styles.identityMeta}>
          {`${PATIENT.name} / ${CAPTURE_META.patientLabel} / Call ${CURRENT_CALL.callId} / ${reviewed ? "Reviewed" : "Review pending"} / Version ${version}`}
        </p>
      </div>

      <div className={styles.form}>
        <div className={styles.columns}>
          <div className={styles.column}>
            {layout.left.map((b) => (
              <Block key={b.heading} block={b} />
            ))}
          </div>
          <div className={styles.column}>
            {layout.right.map((b) => (
              <Block key={b.heading} block={b} />
            ))}
          </div>
        </div>
        {layout.bottom.map((b) => (
          <Block key={b.heading} block={b} />
        ))}
      </div>

      <div className={styles.flex} />
      <p className={styles.footer}>
        {CAPTURE_META.patientLabel} / Not captured means no value recorded / Page 1
      </p>
    </article>
  );
}

function Block({ block }: { block: PrintBlock }) {
  return (
    <>
      <div className={styles.heading}>{block.heading}</div>
      {block.rows.map((row, i) => (
        <div key={i} className={styles.row} style={row.height ? { height: row.height } : undefined}>
          {row.cells.map((cell, j) => (
            <div key={j} className={styles.cell}>
              {cell.label && <span className={styles.cellLabel}>{cell.label}</span>}
              <span className={styles.cellValue}>{cell.value}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
