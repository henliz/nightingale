import { useEffect, useState } from "react";
import { HazardStrip } from "../../components/clinical/HazardStrip";
import { TreatmentTable } from "../../components/clinical/TreatmentTable";
import { VitalsStrip } from "../../components/clinical/VitalsStrip";
import { readingsFromLine } from "../../lib/vitals";
import { Button } from "../../components/ui/Button/Button";
import { Icon } from "../../components/ui/Icon/Icon";
import { useLiveSource } from "../../api/LiveSourceContext";
import { handoffSummary } from "../../api/handoff";
import { HANDOFF_FOOTNOTE, HANDOFF_IDENTITY_UNLOCKED, HANDOFF_LOCKED_IDENTITY, HANDOFF_ROWS } from "../../data/handoff";
import { PARAMEDIC_UNIT } from "../../data/users";
import { useEpcrForm } from "../epcr/useEpcrForm";
import { useIncident, useIncidentDispatch } from "../../incident/IncidentContext";
import { hasReached } from "../../incident/types";
import { clockTime } from "../../lib/time";
import { PrintEpcrDialog } from "../print/PrintEpcrDialog";
import { PhotoViewer } from "../record/views/PhotoViewer";
import { photosByRow } from "../../lib/photoRows";
import styles from "./HandoffPage.module.css";

// one sentence per row was a wall (report p80). split into the separate facts it already is
function facts(text: string): string[] {
  return text
    .split(/;\s+|\.\s+(?=[A-Z0-9])/)
    .map((f) => f.replace(/\.$/, "").trim())
    .filter(Boolean);
}

// allergies or meds that say something real get the attention colour, "none known" stays quiet
const QUIET = /^(none|nkda|no known|not captured|not recorded)/i;

/** paramedic steps 7 + 8: what the ER triage nurse sees after scanning the QR. no account, read-only */
export function HandoffPage() {
  const incident = useIncident();
  const dispatch = useIncidentDispatch();
  const [printOpen, setPrintOpen] = useState(false);
  const live = useLiveSource();
  // scene photos sit next to the row they show (oxygen mask by treatment etc), blurred until receipt
  const photos = (live.record?.files ?? []).filter((f) => f.url);
  const byRow = photosByRow(photos);
  const [viewing, setViewing] = useState<number | null>(null);
  const form = useEpcrForm("paramedic");
  // sample call keeps its written-out summary, a real one reads the paramedic's verified form
  const summary =
    live.source === "demo"
      ? { rows: HANDOFF_ROWS, lockedIdentity: HANDOFF_LOCKED_IDENTITY, unlockedIdentity: HANDOFF_IDENTITY_UNLOCKED, treatments: undefined }
      : handoffSummary(form.sections, incident);

  useEffect(() => {
    dispatch({ type: "handoff_opened", at: clockTime() });
  }, [dispatch]);

  const received = hasReached(incident.stage, "received");
  const version = 1 + Object.keys(incident.fieldReviews).length;
  const verifiedAt = incident.times.verified ?? "pending";

  return (
    <main className={styles.page}>
      <span className={styles.noSignIn}>
        <Icon name="lock" size={12} />
        No sign-in
      </span>

      <header className={styles.head}>
        <div className={styles.identity}>
          <h1 className={styles.title}>Hospital handoff summary</h1>
          <div className={styles.chips}>
            <span className={[styles.chip, received ? styles.chipInk : ""].join(" ")}>{received ? summary.unlockedIdentity : "Patient: identity locked"}</span>
            <span className={styles.chip}>{live.call.callId}</span>
            <span className={styles.chip}>{PARAMEDIC_UNIT} · Rick</span>
            <span className={styles.chip}>{`Version ${version} · verified ${verifiedAt}`}</span>
            {received ? (
              <span className={[styles.chip, styles.chipGreen].join(" ")}>{`Received by triage ${incident.times.received ?? ""}`}</span>
            ) : (
              <span className={[styles.chip, styles.chipRed].join(" ")}>Not yet acknowledged</span>
            )}
          </div>
        </div>
        <div className={styles.headActions}>
          {received ? (
            <>
              <Button variant="secondary" onClick={() => setPrintOpen(true)}>
                Print Letter page
              </Button>
              <Button onClick={() => dispatch({ type: "handoff_read", at: clockTime() })} disabled={incident.handoffReadAt !== null}>
                {incident.handoffReadAt ? `Read ${incident.handoffReadAt}` : "Mark as read"}
              </Button>
            </>
          ) : (
            <Button onClick={() => dispatch({ type: "received", at: clockTime() })}>Confirm receipt and unlock identity</Button>
          )}
        </div>
      </header>

      <div className={styles.hazards}>
        <HazardStrip hazards={live.call.hazards} />
      </div>

      <dl className={styles.rows} style={{ margin: 0 }}>
        {summary.rows.map((row) => {
          const locked = row.identity && !received;
          const items = locked ? [summary.lockedIdentity] : facts(row.text);
          const loud = (row.label === "Allergies" || row.label === "Medications") && !QUIET.test(row.text);
          return (
            <div key={row.label} className={[styles.row, loud ? styles.rowLoud : ""].join(" ")}>
              <dt className={styles.rowLabel}>
                <span className={styles.letter} aria-hidden="true">{row.label[0]}</span>
                {row.label}
              </dt>
              <dd className={[styles.rowText, locked ? styles.rowLocked : ""].join(" ")} style={{ margin: 0 }}>
                {row.label === "Signs" && !locked && readingsFromLine(items[0] ?? "") ? (
                  <div className={styles.signs}>
                    <VitalsStrip readings={readingsFromLine(items[0]!)!} bare />
                    {items.length > 1 && (
                      <ul className={styles.facts}>
                        {items.slice(1).map((f, i) => (
                          <li key={i} className={styles.fact}>
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : row.label === "Treatment" && summary.treatments?.length ? (
                  <TreatmentTable rows={summary.treatments} title={null} />
                ) : (
                  <ul className={styles.facts}>
                    {items.map((f, i) => (
                      <li key={i} className={styles.fact}>
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
                {(byRow.get(row.label) ?? []).length > 0 && (
                  <div className={styles.photos}>
                    {(byRow.get(row.label) ?? []).map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        className={[styles.photo, received ? "" : styles.photoLocked].join(" ")}
                        onClick={() => received && setViewing(photos.indexOf(p))}
                        disabled={!received}
                        aria-label={received ? `Open photo: ${p.kind}` : "Photo locked until receipt is confirmed"}
                        title={received ? p.kind : "Unlocks with identity"}
                      >
                        <img src={p.url} alt="" />
                      </button>
                    ))}
                  </div>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <p className={styles.footnote}>{HANDOFF_FOOTNOTE}</p>

      <PrintEpcrDialog role="paramedic" open={printOpen} onClose={() => setPrintOpen(false)} />
      {viewing !== null && <PhotoViewer photos={photos} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />}
    </main>
  );
}
