import { NOT_CAPTURED } from "../../data/epcr";
import type { ResolvedField } from "../../incident/selectors";
import styles from "./EpcrField.module.css";

interface EpcrFieldProps {
  resolved: ResolvedField;
  /** red outline whatever the pipeline flag says (e.g. required for handoff, still empty) */
  attention?: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onToggleCheckbox: (checked: boolean) => void;
}

// one ePCR line. looks like an input but it's a button, values only change through the
// review dialog so every change keeps who confirmed it + when
export function EpcrField({ resolved, attention = false, selected, onSelect, onOpen, onToggleCheckbox }: EpcrFieldProps) {
  const { field, value, review } = resolved;
  const flagged = resolved.flagged || attention;

  if (field.kind === "checkbox") {
    const checked = value === "yes";
    return (
      <label className={styles.checkbox}>
        <input type="checkbox" hidden checked={checked} onChange={(e) => onToggleCheckbox(e.target.checked)} />
        <span className={[styles.box, checked ? styles.boxChecked : ""].join(" ")} aria-hidden="true" />
        {field.label}
      </label>
    );
  }

  const surfaceClass = [
    styles.surface,
    field.kind === "textarea" ? styles.textarea : "",
    flagged ? styles.flagged : "",
    selected ? styles.selected : "",
  ].join(" ");

  return (
    <div className={styles.field}>
      <span className={styles.label} id={`label-${field.key}`}>
        {field.label}
      </span>
      <button
        type="button"
        className={surfaceClass}
        aria-labelledby={`label-${field.key}`}
        aria-pressed={selected}
        onClick={selected ? onOpen : onSelect}
        onDoubleClick={onOpen}
      >
        <span className={value === NOT_CAPTURED ? styles.placeholder : undefined}>{value}</span>
        {review && <span className={styles.reviewed}>{review.status === "cleared" ? "Cleared" : "Confirmed"}</span>}
      </button>
    </div>
  );
}
