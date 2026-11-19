import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { AppShell } from "../../components/layout/AppShell/AppShell";
import { CAPTURE_META, CAPTURE_TURN_BY_ID, turnsById, type CaptureExcerpt, type EpcrSection, type EpcrTab } from "../../data/epcr";
import type { User } from "../../data/users";
import { useIncident, useIncidentDispatch } from "../../incident/IncidentContext";
import { resolveField } from "../../incident/selectors";
import type { FieldReview } from "../../incident/types";
import { clockTime } from "../../lib/time";
import { ReviewQueuePanel } from "./ReviewQueuePanel";
import { EpcrDraftPanel } from "./EpcrDraftPanel";
import { FieldReviewDialog } from "./FieldReviewDialog";
import styles from "./EpcrReviewPage.module.css";

interface EpcrReviewPageProps {
  user: User;
  /** who gets credited on confirmed fields, e.g. "FF-12" */
  responder: string;
  title: string;
  meta: string;
  tabs: readonly { id: EpcrTab; label: string }[];
  sections: readonly EpcrSection[];
  /** transcript beside the draft, defaults to the fixture */
  excerpts?: readonly CaptureExcerpt[];
  captureSummary?: string;
  initialTab: EpcrTab;
  saveLabel: string;
  savePrimary?: boolean;
  /** fire works through every drafted line, paramedic only gets conflicts + what handoff needs */
  showCapture?: boolean;
  /** fields that still need attention (red outline, dot on their tab) */
  attentionKeys?: ReadonlySet<string>;
  /** fires after a confirm that changed the stored value */
  onFieldChanged?: (label: string, previous: string, next: string) => void;
  onSave: () => void;
}

/** review queue beside the structured draft, one field at a time, never the whole transcript */
export function EpcrReviewPage(props: EpcrReviewPageProps) {
  const { user, responder, title, meta, tabs, sections, excerpts, captureSummary, initialTab, saveLabel, savePrimary, showCapture = true, attentionKeys, onFieldChanged, onSave } = props;
  const fieldByKey = new Map(sections.flatMap((s) => s.fields.map((f) => [f.key, f] as const)));
  const turns = excerpts ? turnsById(excerpts) : CAPTURE_TURN_BY_ID;
  const incident = useIncident();
  const dispatch = useIncidentDispatch();
  // ?field=patient.age arrives from a conflict in the record overview
  const [params] = useSearchParams();
  const linked = params.get("field");
  const linkedField = linked ? fieldByKey.get(linked) : undefined;
  const [tab, setTab] = useState<EpcrTab>(() => (linkedField ? (sections.find((s) => s.fields.some((f) => f.key === linked))?.tab ?? initialTab) : initialTab));
  const [selectedKey, setSelectedKey] = useState<string | null>(linkedField ? linked : null);

  // bring the selected field into view in the form
  useEffect(() => {
    if (!selectedKey) return;
    const el = document.getElementById(`label-${selectedKey}`);
    el?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [selectedKey, tab]);
  const [reviewingKey, setReviewingKey] = useState<string | null>(null);

  const reviewing = reviewingKey ? fieldByKey.get(reviewingKey) : undefined;
  const reviewedCount = Object.keys(incident.fieldReviews).length;

  // picking from the queue jumps the form to that field's tab
  function selectFromQueue(key: string) {
    setSelectedKey(key);
    const section = sections.find((s) => s.fields.some((f) => f.key === key));
    if (section) setTab(section.tab);
  }

  function confirmField(key: string, review: Omit<FieldReview, "by" | "at">) {
    const field = fieldByKey.get(key);
    const previous = field ? resolveField(field, incident).value : "";
    dispatch({ type: "field_reviewed", key, review: { ...review, by: responder, at: clockTime() } });
    if (field && onFieldChanged && review.value !== previous) onFieldChanged(field.label, previous, review.value);
    setReviewingKey(null);
  }

  function toggleCheckbox(key: string, checked: boolean) {
    if (checked) dispatch({ type: "field_reviewed", key, review: { value: "yes", status: "confirmed", by: responder, at: clockTime() } });
    else dispatch({ type: "field_review_cleared", key });
  }

  return (
    <AppShell user={user} density="compact">
      <header className={styles.identity}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.meta}>{meta}</p>
      </header>

      <div className={styles.workspace}>
        <ReviewQueuePanel
          mode={showCapture ? "fire" : "handoff"}
          sections={sections}
          incident={incident}
          turns={turns}
          summary={showCapture ? (captureSummary ?? CAPTURE_META.summary) : "Fire's record. Fix what's flagged, fill what the ER needs."}
          attentionKeys={attentionKeys ?? new Set()}
          selectedKey={selectedKey}
          onSelect={selectFromQueue}
          onConfirm={confirmField}
          onEdit={setReviewingKey}
        />
        <EpcrDraftPanel
          tabs={tabs}
          sections={sections}
          tab={tab}
          onTabChange={setTab}
          incident={incident}
          selectedKey={selectedKey}
          onSelectField={setSelectedKey}
          onOpenField={(key) => {
            setSelectedKey(key);
            setReviewingKey(key);
          }}
          onToggleCheckbox={toggleCheckbox}
          attentionKeys={attentionKeys}
          savePrimary={savePrimary}
          draftStatus={reviewedCount === 0 ? "Draft, not saved" : `Draft, not saved · ${reviewedCount} field${reviewedCount === 1 ? "" : "s"} reviewed`}
          saveLabel={saveLabel}
          onSave={onSave}
        />
      </div>

      <FieldReviewDialog
        resolved={reviewing ? resolveField(reviewing, incident) : null}
        turns={turns}
        onConfirm={confirmField}
        onClose={() => setReviewingKey(null)}
      />
    </AppShell>
  );
}
