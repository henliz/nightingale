import { Field } from "../../../components/ui/Field/Field";
import { useLiveSource } from "../../../api/LiveSourceContext";
import styles from "./views.module.css";

/** what the paramedic crew sees before accepting: hazards + dispatch summary, no identity */
export function LockedSummaryView({ showSummary }: { showSummary: boolean }) {
  const { call } = useLiveSource();
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
        <p className={styles.noteText}>{call.hazards}</p>
      </div>
      <div className={styles.columnTight} style={{ maxWidth: 560 }}>
        <Field label="Call" value={`${call.callId} · ${call.headline}`} />
        <Field label="Dispatch" value={call.dispatchText} />
        <Field label="Patient" value="Identity locked until accepted" />
        <Field label="Shared by" value="Woolwich Township Fire, FF-12" />
      </div>
    </div>
  );
}
