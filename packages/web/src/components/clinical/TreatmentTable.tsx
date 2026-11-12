import type { Treatment } from "../../data/record";
import styles from "./TreatmentTable.module.css";

// doses + shocks are the number crews trust least (p25), so they get a real table, not a sentence
const DOSE = /\b(\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|mL|L\/min|l\/min|J|joules?|units?)|\d+\s?shocks?|narcan|naloxone|epi(?:nephrine)?|asa|aspirin|nitro|glucagon|ventolin|salbutamol|oxygen)\b/gi;

const IS_DOSE = new RegExp(`^${DOSE.source}$`, "i");

function highlight(text: string) {
  return text.split(DOSE).map((p, i) => (IS_DOSE.test(p) ? <mark key={i} className={styles.dose}>{p}</mark> : p));
}

export function TreatmentTable({ rows, title = "Treatments" }: { rows: readonly Treatment[]; title?: string | null }) {
  if (rows.length === 0) return null;
  return (
    <div className={styles.wrap}>
      {title && <p className={styles.title}>{title}</p>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Treatment</th>
            <th scope="col">Response</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.time}-${i}`}>
              <td className={styles.time}>{r.time || "--"}</td>
              <td>{highlight(r.what)}</td>
              <td className={styles.response}>{r.response || "--"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
