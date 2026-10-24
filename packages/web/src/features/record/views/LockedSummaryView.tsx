import { Field } from "../../../components/ui/Field/Field";
import { HANDOFF_HAZARDS } from "../../../data/handoff";
import { CURRENT_CALL } from "../../../data/incident";
import styles from "./views.module.css";

/** what the paramedic crew sees before accepting: hazards + dispatch summary, no identity */
export function LockedSummaryView({ showSummary }: { showSummary: boolean }) {
  if (!showSummary) {
    return (
      <div className={styles.view}>
        <p className={styles.lede}>Locked until the record is accepted. Accept record on your queue to unlock the full record.</p>
      </div>
    );
  }
  return (
    <div className={styles.view}>
      <h3 className={styles.heading}>Locked summary</h3>
      <p className={styles.lede}>
        The fire crew shared this record. Identity, history and files unlock once you accept it. Hazards show now so the crew is never
        surprised on scene.
      </p>
      <div className={styles.note}>
        <p className={styles.noteSource}>Scene safety</p>
        <p className={styles.noteText}>{HANDOFF_HAZARDS}</p>
      </div>
      <div className={styles.columnTight} style={{ maxWidth: 560 }}>
        <Field label="Call" value={`${CURRENT_CALL.callId} · ${CURRENT_CALL.title}`} />
        <Field label="Dispatch" value={CURRENT_CALL.dispatch.text} />
        <Field label="Patient" value="Patient 007 · identity locked until accepted" />
        <Field label="Shared by" value="Woolwich Township Fire, FF-12" />
      </div>
    </div>
  );
}
