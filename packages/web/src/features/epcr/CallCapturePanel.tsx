import { useState } from "react";
import { Button } from "../../components/ui/Button/Button";
import { CAPTURE_EXCERPTS, CAPTURE_META, type CaptureExcerpt } from "../../data/epcr";
import { useLiveSource } from "../../api/LiveSourceContext";
import styles from "./CallCapturePanel.module.css";

type CaptureView = "overview" | "transcript";

interface CallCapturePanelProps {
  excerpts?: readonly CaptureExcerpt[];
  summary?: string;
  /** transcript turn ids backing the selected ePCR field */
  highlightedTurnIds: ReadonlySet<string>;
  onSelectTurn: (turnId: string) => void;
  /** footer text for what the selection means right now */
  hint: string;
  canReview: boolean;
  onReviewField: () => void;
}

export function CallCapturePanel({
  excerpts = CAPTURE_EXCERPTS,
  summary = CAPTURE_META.summary,
  highlightedTurnIds,
  onSelectTurn,
  hint,
  canReview,
  onReviewField,
}: CallCapturePanelProps) {
  const [view, setView] = useState<CaptureView>("transcript");

  return (
    <aside className={styles.panel} aria-label="Call capture">
      <div className={styles.header}>
        <h2 className={styles.title}>Call capture</h2>
        <p className={styles.subtitle}>{summary}</p>
      </div>

      <div className={styles.toggle} role="tablist" aria-label="Capture view">
        {(["overview", "transcript"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={[styles.toggleTab, view === id ? styles.toggleActive : ""].join(" ")}
            onClick={() => setView(id)}
          >
            {id === "overview" ? "Overview" : "Transcript"}
          </button>
        ))}
      </div>

      <div className={styles.scroll}>
        {view === "transcript" ? <Transcript excerpts={excerpts} highlighted={highlightedTurnIds} onSelect={onSelectTurn} /> : <Overview excerpts={excerpts} />}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerHint}>{hint}</span>
        <Button variant="secondary" onClick={onReviewField} disabled={!canReview}>
          Review field
        </Button>
      </div>
    </aside>
  );
}

function Transcript({
  excerpts,
  highlighted,
  onSelect,
}: {
  excerpts: readonly CaptureExcerpt[];
  highlighted: ReadonlySet<string>;
  onSelect: (id: string) => void;
}) {
  const { partials } = useLiveSource();
  if (excerpts.length === 0 && partials.length === 0) return <p className={styles.overviewValue}>No transcript yet. Lines appear as the device uploads chunks.</p>;
  return (
    <>
      {excerpts.map((excerpt) => (
        <div key={excerpt.time} className={styles.excerpt}>
          {excerpt.turns.map((turn) => {
            const selected = highlighted.has(turn.id);
            return (
              <button
                key={turn.id}
                type="button"
                className={[styles.turn, selected ? styles.turnSelected : ""].join(" ")}
                aria-pressed={selected}
                aria-label={`${turn.speaker} at ${turn.time}: ${turn.text}`}
                onClick={() => onSelect(turn.id)}
              >
                <span className={styles.turnHead}>
                  <span className={styles.speaker}>{turn.speaker}</span>
                  <span className={styles.time}>{turn.time}</span>
                </span>
                <span className={styles.text}>{turn.text}</span>
              </button>
            );
          })}
        </div>
      ))}
      {partials.map((p) => (
        <div key={p.id} className={[styles.turn, styles.turnLive].join(" ")} aria-live="polite">
          <span className={styles.turnHead}>
            <span className={styles.speaker}>Hearing…</span>
          </span>
          <span className={styles.text}>{p.text}</span>
        </div>
      ))}
    </>
  );
}

function Overview({ excerpts }: { excerpts: readonly CaptureExcerpt[] }) {
  const turns = excerpts.flatMap((e) => e.turns);
  const live = useLiveSource();
  const speakers = Array.from(new Set(turns.map((t) => t.speaker)));
  const others = speakers.filter((s) => s !== "Responder" && s !== "Captain");
  const rows = [
    ["Dispatch", live.call.dispatchText],
    ["Capture", live.session ? `${live.session.assets.length} chunks from ${live.session.deviceId ?? "the device"}` : `Ended ${CAPTURE_META.captureEnded}, imported ${CAPTURE_META.imported}`],
    ["Speakers", speakers.join(", ") || "none yet"],
    ["Turns", `${turns.length} turns across ${excerpts.length} excerpts`],
    ["Non-responder voices", others.length ? `${others.join(", ")}: flagged for review before anything is shared` : "none heard"],
  ] as const;
  return (
    <div className={styles.overview}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.overviewRow}>
          <span className={styles.overviewLabel}>{label}</span>
          <span className={styles.overviewValue}>{value}</span>
        </div>
      ))}
    </div>
  );
}
