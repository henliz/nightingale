import styles from "./Field.module.css";

interface FieldProps {
  label: string;
  value: string;
  className?: string;
  /** why it needs a look, shown in red under the value */
  flag?: string;
  /** muted line under the value, e.g. who confirmed it */
  note?: string;
}

/** small muted label over a body-size value, empty value renders as an empty input outline */
export function Field({ label, value, className, flag, note }: FieldProps) {
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <span className={styles.label}>{label}</span>
      {value ? <span className={styles.value}>{value}</span> : <span className={styles.empty} aria-label="Empty" />}
      {flag && <span className={styles.flag}>⚠ {flag}</span>}
      {note && <span className={styles.label}>{note}</span>}
    </div>
  );
}
