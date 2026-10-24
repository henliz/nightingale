import styles from "./Field.module.css";

interface FieldProps {
  label: string;
  value: string;
  className?: string;
}

/** small muted label over a body-size value, empty value renders as an empty input outline */
export function Field({ label, value, className }: FieldProps) {
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <span className={styles.label}>{label}</span>
      {value ? <span className={styles.value}>{value}</span> : <span className={styles.empty} aria-label="Empty" />}
    </div>
  );
}
