import { VitalsStrip } from "../../components/clinical/VitalsStrip";
import { NOT_CAPTURED } from "../../data/epcr";
import { readingsFromLine } from "../../lib/vitals";
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

  const empty = value === NOT_CAPTURED;
  // red box = conflict or still needed for handoff (the old look, hen found it clearer than dots),
  // dashed = not captured, pill = confirmed, plain = drafted and waiting
  const state = resolved.flagged || (attention && !review) ? "flagged" : review ? "confirmed" : empty ? "empty" : "suggested";
  // a vitals set reads like a monitor, not a sentence. still the same field, still opens the review
  const readings = field.key.startsWith("vitals.") && !empty ? readingsFromLine(value) : null;
  const surfaceClass = [
    styles.surface,
    field.kind === "textarea" ? styles.textarea : "",
    readings ? styles.vitals : "",
    styles[state],
    selected ? styles.selected : "",
  ].join(" ");

  // "Intervention at 20:16:43" rows: time in its own column so a run of them reads like a log
  const timed = /^interventions\.\d+$/.test(field.key) ? /(\d{1,2}:\d{2}(?::\d{2})?)/.exec(field.label)?.[1] : undefined;

  return (
    <div className={[styles.field, timed ? styles.timed : ""].join(" ")}>
      <span className={[styles.label, timed ? styles.timeLabel : ""].join(" ")} id={`label-${field.key}`}>
        {timed ? <span aria-label={field.label}>{timed}</span> : field.label}
      </span>
      <button
        type="button"
        className={surfaceClass}
        aria-labelledby={`label-${field.key}`}
        aria-pressed={selected}
        onClick={selected ? onOpen : onSelect}
        onDoubleClick={onOpen}
      >
        {readings ? (
          <span className={styles.vitalsBody}>
            <VitalsStrip readings={readings} bare />
          </span>
        ) : (
          <span className={empty ? styles.placeholder : undefined}>{empty ? "Not captured" : value}</span>
        )}
        {review && (
          <span className={styles.reviewed}>
            <span aria-hidden="true">✓</span> {review.status === "cleared" ? "Cleared" : "Confirmed"}
          </span>
        )}
      </button>
      {resolved.flagged && field.flagNote && <span className={styles.flagNote}>⚠ {field.flagNote}</span>}
      {!resolved.flagged && attention && !review && <span className={styles.flagNote}>Needed for handoff</span>}
    </div>
  );
}
