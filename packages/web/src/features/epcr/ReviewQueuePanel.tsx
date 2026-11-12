import { useRef, useState } from "react";
import { Button } from "../../components/ui/Button/Button";
import { NOT_CAPTURED, type CaptureTurn, type EpcrSection } from "../../data/epcr";
import { resolveField, type ResolvedField } from "../../incident/selectors";
import type { FieldReview, IncidentState } from "../../incident/types";
import { bestEvidence } from "../../lib/evidence";
import styles from "./ReviewQueuePanel.module.css";

interface ReviewQueuePanelProps {
  sections: readonly EpcrSection[];
  incident: IncidentState;
  turns: ReadonlyMap<string, CaptureTurn>;
  summary: string;
  attentionKeys: ReadonlySet<string>;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onConfirm: (key: string, review: Omit<FieldReview, "by" | "at">) => void;
  onEdit: (key: string) => void;
  /** paramedic side: only conflicts + what the ER still needs, fire's drafted lines aren't theirs to sign off */
  mode?: "fire" | "handoff";
}

interface QueueItem {
  resolved: ResolvedField;
  section: string;
  urgent: boolean;
}

// what's worth a look: anything the pipeline filled, flagged, or that handoff needs
function buildQueue(sections: readonly EpcrSection[], incident: IncidentState, attention: ReadonlySet<string>, handoffOnly: boolean): QueueItem[] {
  const items: QueueItem[] = [];
  for (const s of sections) {
    for (const field of s.fields) {
      if (field.kind === "checkbox") continue;
      const resolved = resolveField(field, incident);
      const urgent = Boolean(field.flagged) || attention.has(field.key);
      if (!urgent && !field.suggested && !resolved.review) continue;
      if (handoffOnly && !urgent && !resolved.review) continue;
      items.push({ resolved, section: s.title, urgent });
    }
  }
  // flagged first, otherwise keep form order
  return items.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}

/** field by field review, only the lines behind the current field ever show, never the whole call */
export function ReviewQueuePanel({ sections, incident, turns, summary, attentionKeys, selectedKey, onSelect, onConfirm, onEdit, mode = "fire" }: ReviewQueuePanelProps) {
  const queue = buildQueue(sections, incident, attentionKeys, mode === "handoff");
  const pending = queue.filter((q) => !q.resolved.review);
  const done = queue.filter((q) => q.resolved.review);
  const current = queue.find((q) => q.resolved.field.key === selectedKey) ?? pending[0];
  const pct = queue.length ? Math.round((done.length / queue.length) * 100) : 0;

  // confirming plays a short beat: the card stamps itself, then the next one slides in
  // and the row drops into "checked". under 0.4s, and skipped for reduced motion
  const [settling, setSettling] = useState<{ key: string; cleared: boolean } | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  function confirmCurrent(value: string) {
    if (!current || settling) return;
    const key = current.resolved.field.key;
    const finish = () => {
      onConfirm(key, { value, status: value ? "confirmed" : "cleared" });
      setSettling(null);
      setJustDone(key);
      // hop to the next one still waiting
      const next = pending.find((q) => q.resolved.field.key !== key);
      if (next) onSelect(next.resolved.field.key);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();
    setSettling({ key, cleared: !value });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(finish, 380);
  }

  return (
    <aside className={styles.panel} aria-label="Review queue">
      <div className={styles.header}>
        <div className={styles.headRow}>
          <h2 className={styles.title}>{mode === "handoff" ? "Before handoff" : "Review queue"}</h2>
          <span className={styles.count}>
            {done.length}/{queue.length}
          </span>
        </div>
        <p className={styles.subtitle}>{summary}</p>
        <div className={styles.progress} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Fields checked">
          <span className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className={styles.scroll}>
        {current ? (
          <CurrentCard
            key={current.resolved.field.key}
            item={current}
            turns={turns}
            settling={settling?.key === current.resolved.field.key ? settling : null}
            onConfirm={confirmCurrent}
            onEdit={() => onEdit(current.resolved.field.key)}
          />
        ) : (
          <p className={styles.empty}>Nothing to check on this call yet.</p>
        )}

        {pending.length > 0 && <QueueList label={`To check · ${pending.length}`} items={pending} currentKey={current?.resolved.field.key} onSelect={onSelect} />}
        {done.length > 0 && <QueueList label={`Checked · ${done.length}`} items={done} currentKey={current?.resolved.field.key} justDone={justDone} onSelect={onSelect} />}
      </div>
    </aside>
  );
}

function CurrentCard({
  item,
  turns,
  settling,
  onConfirm,
  onEdit,
}: {
  item: QueueItem;
  turns: ReadonlyMap<string, CaptureTurn>;
  settling: { cleared: boolean } | null;
  onConfirm: (value: string) => void;
  onEdit: () => void;
}) {
  const { field, value, review } = item.resolved;
  const empty = value === NOT_CAPTURED;
  // just the few lines this field leans on, best match first
  const all = (field.evidence ?? []).map((id) => turns.get(id)).filter((t) => t !== undefined);
  const lines = bestEvidence(all, empty ? "" : value, field.flagNote ?? "");

  return (
    <div className={[styles.card, item.urgent && !review ? styles.cardUrgent : "", settling ? styles.cardSettling : ""].join(" ")} aria-busy={settling ? true : undefined}>
      {settling && (
        <span className={styles.stamp} role="status">
          <span aria-hidden="true">✓</span> {settling.cleared ? "Cleared" : "Confirmed"}
        </span>
      )}
      <p className={styles.cardSection}>{item.section}</p>
      <p className={styles.cardLabel}>{field.label}</p>
      <p className={[styles.cardValue, empty ? styles.cardValueEmpty : ""].join(" ")}>{value}</p>

      {field.flagNote && !review && <p className={styles.flagNote}>{field.flagNote}</p>}

      <div className={styles.heard}>
        <p className={styles.heardTitle}>Heard on the call</p>
        {lines.length === 0 ? (
          <p className={styles.heardLine}>{all.length ? "No single line matches this value. Check it against what you remember." : "Nothing said about this. Leave it empty unless you know it."}</p>
        ) : (
          lines.map((t) => (
            <p key={t.id} className={styles.heardLine}>
              <span className={styles.heardMeta}>
                {t.time} · {t.speaker}
              </span>
              “{t.text}”
            </p>
          ))
        )}
      </div>

      {review ? (
        <p className={styles.reviewedNote}>
          {review.status === "cleared" ? "Cleared" : "Confirmed"} by {review.by} at {review.at}
        </p>
      ) : null}

      <div className={styles.actions}>
        <Button onClick={() => onConfirm(empty ? "" : value)} disabled={empty && !review}>
          {review ? "Confirm again" : "Looks right"}
        </Button>
        <Button variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghostInk" onClick={() => onConfirm("")}>
          Clear
        </Button>
      </div>
    </div>
  );
}

function QueueList({ label, items, currentKey, justDone, onSelect }: { label: string; items: QueueItem[]; currentKey?: string; justDone?: string | null; onSelect: (key: string) => void }) {
  return (
    <div className={styles.list}>
      <p className={styles.listLabel}>{label}</p>
      {items.map(({ resolved, urgent }) => {
        const key = resolved.field.key;
        const state = resolved.review ? "done" : urgent ? "urgent" : "todo";
        return (
          <button key={key} type="button" className={[styles.row, key === currentKey ? styles.rowActive : "", key === justDone ? styles.rowJust : ""].join(" ")} aria-current={key === currentKey} onClick={() => onSelect(key)}>
            <span className={[styles.dot, styles[state]].join(" ")} aria-hidden="true" />
            <span className={styles.rowLabel}>{resolved.field.label}</span>
            <span className={styles.rowValue}>{resolved.value === NOT_CAPTURED ? "empty" : resolved.value}</span>
          </button>
        );
      })}
    </div>
  );
}
