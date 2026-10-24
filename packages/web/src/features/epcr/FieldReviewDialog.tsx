import { useState } from "react";
import { Button } from "../../components/ui/Button/Button";
import { Dialog } from "../../components/ui/Dialog/Dialog";
import { CAPTURE_TURN_BY_ID, type CaptureTurn } from "../../data/epcr";
import type { ResolvedField } from "../../incident/selectors";
import type { FieldReview } from "../../incident/types";
import styles from "./FieldReviewDialog.module.css";

interface FieldReviewDialogProps {
  resolved: ResolvedField | null;
  turns?: ReadonlyMap<string, CaptureTurn>;
  onConfirm: (key: string, review: Omit<FieldReview, "by" | "at">) => void;
  onClose: () => void;
}

/** overlay C: original capture stays visible beside the value being confirmed */
export function FieldReviewDialog({ resolved, turns = CAPTURE_TURN_BY_ID, onConfirm, onClose }: FieldReviewDialogProps) {
  return (
    <Dialog open={resolved !== null} onClose={onClose} label="Review field" width={640}>
      {resolved && <ReviewForm key={resolved.field.key} resolved={resolved} turns={turns} onConfirm={onConfirm} onClose={onClose} />}
    </Dialog>
  );
}

function ReviewForm({
  resolved,
  turns,
  onConfirm,
  onClose,
}: { resolved: ResolvedField; turns: ReadonlyMap<string, CaptureTurn> } & Omit<FieldReviewDialogProps, "resolved" | "turns">) {
  const { field, review } = resolved;
  const suggestion = field.suggested ?? "";
  const [value, setValue] = useState(review ? review.value : suggestion);

  // a real note's spans can point at dozens of lines; show the first few
  const speech = (field.evidence ?? [])
    .map((id) => turns.get(id))
    .filter((t) => t !== undefined)
    .slice(0, 6);

  const status = review
    ? `${review.status === "cleared" ? "Cleared" : "Confirmed"} by ${review.by} at ${review.at}`
    : "Suggested value / Not reviewed";

  function confirm() {
    const trimmed = value.trim();
    onConfirm(field.key, { value: trimmed, status: trimmed ? "confirmed" : "cleared" });
  }

  return (
    <div className={styles.body}>
      <div className={styles.head}>
        <div className={styles.identity}>
          <h2 className={styles.title}>Review field</h2>
          <p className={styles.fieldName}>{field.label}</p>
        </div>
        <Button variant="ghostInk" onClick={onClose}>
          Close
        </Button>
      </div>

      {field.flagNote && (
        <div className={styles.flagBox}>
          <p className={styles.flagTitle}>Why it's flagged</p>
          <p className={styles.speechLine}>{field.flagNote}</p>
        </div>
      )}

      <div className={styles.speech}>
        <p className={styles.speechTitle}>Supporting speech</p>
        {speech.length === 0 ? (
          <p className={styles.speechLine}>Nothing was said about this field. Leave it empty unless you know the value.</p>
        ) : (
          speech.map((t) => (
            <p key={t.id} className={styles.speechLine}>
              {t.time} {t.speaker}: {t.text}
            </p>
          ))
        )}
      </div>

      <label className={styles.input}>
        <span className={styles.inputLabel}>Value in ePCR</span>
        <textarea className={styles.textarea} value={value} onChange={(e) => setValue(e.target.value)} />
      </label>

      <div className={styles.row}>
        <Button variant="secondary" onClick={() => setValue("")}>
          Clear value
        </Button>
        <Button variant="ghostInk" onClick={() => setValue(suggestion)} disabled={!suggestion}>
          Restore suggestion
        </Button>
      </div>

      <p className={styles.status}>{status}</p>

      <div className={styles.footer}>
        <p className={styles.status}>The original capture stays available. Confirming a value does not share this record.</p>
        <div className={styles.footerButtons}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm}>Confirm value</Button>
        </div>
      </div>
    </div>
  );
}
