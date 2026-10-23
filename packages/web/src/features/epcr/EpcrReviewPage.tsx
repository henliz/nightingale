import { useState } from "react";
import { AppShell } from "../../components/layout/AppShell/AppShell";
import { fieldForTurn, turnsById, type CaptureExcerpt, type EpcrSection, type EpcrTab } from "../../data/epcr";
import type { User } from "../../data/users";
import { useIncident, useIncidentDispatch } from "../../incident/IncidentContext";
import { resolveField } from "../../incident/selectors";
import type { FieldReview } from "../../incident/types";
import { clockTime } from "../../lib/time";
import { CallCapturePanel } from "./CallCapturePanel";
import { EpcrDraftPanel } from "./EpcrDraftPanel";
import { FieldReviewDialog } from "./FieldReviewDialog";
import styles from "./EpcrReviewPage.module.css";

interface EpcrReviewPageProps {
  user: User;
  /** Who gets credited on confirmed fields, e.g. "FF-12". */
  responder: string;
  title: string;
  meta: string;
  tabs: readonly { id: EpcrTab; label: string }[];
  sections: readonly EpcrSection[];
  /** The transcript beside the draft; defaults to the fixture. */
  excerpts?: readonly CaptureExcerpt[];
  captureSummary?: string;
  initialTab: EpcrTab;
  saveLabel: string;
  savePrimary?: boolean;
  /** Fire shows the transcript beside the draft; the paramedic verifies without it. */
  showCapture?: boolean;
  /** Fields that still need attention (red outline, dot on their tab). */
  attentionKeys?: ReadonlySet<string>;
  /** Fires after a confirm that changed the stored value. */
  onFieldChanged?: (label: string, previous: string, next: string) => void;
  onSave: () => void;
}

/** Transcript beside the structured draft; every field is checked against what was said. */
export function EpcrReviewPage(props: EpcrReviewPageProps) {
  const { user, responder, title, meta, tabs, sections, excerpts, captureSummary, initialTab, saveLabel, savePrimary, showCapture = true, attentionKeys, onFieldChanged, onSave } = props;
  const fieldByKey = new Map(sections.flatMap((s) => s.fields.map((f) => [f.key, f] as const)));
  const turns = excerpts ? turnsById(excerpts) : undefined;
  const incident = useIncident();
  const dispatch = useIncidentDispatch();
  const [tab, setTab] = useState<EpcrTab>(initialTab);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const [reviewingKey, setReviewingKey] = useState<string | null>(null);

  const selectedField = selectedKey ? fieldByKey.get(selectedKey) : undefined;
  const highlighted = new Set(selectedField?.evidence ?? []);
  if (selectedTurnId) highlighted.add(selectedTurnId);
  const captureHint = selectedKey
    ? "Check the selected field"
    : selectedTurnId
      ? "This line does not fill a field"
      : "Select a field to review it";
  const reviewing = reviewingKey ? fieldByKey.get(reviewingKey) : undefined;
  const reviewedCount = Object.keys(incident.fieldReviews).length;

  function selectTurn(turnId: string) {
    setSelectedTurnId(turnId);
    const field = fieldForTurn(turnId, sections);
    if (!field) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey(field.key);
    const section = sections.find((s) => s.fields.some((f) => f.key === field.key));
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

      <div className={showCapture ? styles.workspace : styles.workspaceSingle}>
        {showCapture && (
          <CallCapturePanel
            excerpts={excerpts}
            summary={captureSummary}
            highlightedTurnIds={highlighted}
            onSelectTurn={selectTurn}
            hint={captureHint}
            canReview={selectedKey !== null}
            onReviewField={() => setReviewingKey(selectedKey)}
          />
        )}
        <EpcrDraftPanel
          tabs={tabs}
          sections={sections}
          tab={tab}
          onTabChange={setTab}
          incident={incident}
          selectedKey={selectedKey}
          onSelectField={(key) => {
            setSelectedKey(key);
            setSelectedTurnId(null);
          }}
          onOpenField={(key) => {
            setSelectedKey(key);
            setReviewingKey(key);
          }}
          onToggleCheckbox={toggleCheckbox}
          attentionKeys={attentionKeys}
          savePrimary={savePrimary}
          draftStatus={reviewedCount === 0 ? "Draft [ Not Saved ]" : `Draft [ Not Saved ]  ·  ${reviewedCount} field${reviewedCount === 1 ? "" : "s"} reviewed`}
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
