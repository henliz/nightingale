import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button/Button";
import { Icon } from "../../components/ui/Icon/Icon";
import { HANDOFF_FOOTNOTE, HANDOFF_HAZARDS, HANDOFF_IDENTITY_UNLOCKED, HANDOFF_LOCKED_IDENTITY, HANDOFF_ROWS } from "../../data/handoff";
import { CURRENT_CALL } from "../../data/incident";
import { useIncident, useIncidentDispatch } from "../../incident/IncidentContext";
import { hasReached } from "../../incident/types";
import { clockTime } from "../../lib/time";
import { PrintEpcrDialog } from "../print/PrintEpcrDialog";
import styles from "./HandoffPage.module.css";

/** paramedic steps 7 + 8: what the ER triage nurse sees after scanning the QR. no account, read-only */
export function HandoffPage() {
  const incident = useIncident();
  const dispatch = useIncidentDispatch();
  const [printOpen, setPrintOpen] = useState(false);

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
            <span className={[styles.chip, received ? styles.chipInk : ""].join(" ")}>{received ? HANDOFF_IDENTITY_UNLOCKED : "Patient: identity locked"}</span>
            <span className={styles.chip}>Call {CURRENT_CALL.callId}</span>
            <span className={styles.chip}>{CURRENT_CALL.paramedicUnit} · Rick</span>
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

      <p className={styles.hazards}>{HANDOFF_HAZARDS}</p>

      <dl className={styles.rows} style={{ margin: 0 }}>
        {HANDOFF_ROWS.map((row) => {
          const locked = row.identity && !received;
          return (
            <div key={row.label} className={styles.row}>
              <dt className={styles.rowLabel}>{row.label}</dt>
              <dd className={[styles.rowText, locked ? styles.rowLocked : ""].join(" ")} style={{ margin: 0 }}>
                {locked ? HANDOFF_LOCKED_IDENTITY : row.text}
              </dd>
            </div>
          );
        })}
      </dl>

      <p className={styles.footnote}>{HANDOFF_FOOTNOTE}</p>

      <PrintEpcrDialog open={printOpen} onClose={() => setPrintOpen(false)} />
    </main>
  );
}
