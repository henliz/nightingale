import { useState } from "react";
import { Button } from "../../components/ui/Button/Button";
import { Dialog } from "../../components/ui/Dialog/Dialog";
import { Icon } from "../../components/ui/Icon/Icon";
import { useLiveSource } from "../../api/LiveSourceContext";
import { UNNAMED } from "../../api/call";
import { PARAMEDIC_UNIT } from "../../data/users";
import styles from "./ShareRecordDialog.module.css";

export const HANDOFF_LINK = "handoff.nightingale.ca/h/7Q4K-29XZ";

interface ShareRecordDialogProps {
  open: boolean;
  /** called once the captain sends the link (Copy link or Done) */
  onShared: () => void;
  onClose: () => void;
}

/** overlay E: sends the reviewed record to the paramedic crew, they have to accept it */
export function ShareRecordDialog({ open, onShared, onClose }: ShareRecordDialogProps) {
  const [copied, setCopied] = useState(false);
  const { call } = useLiveSource();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`https://${HANDOFF_LINK}`);
      setCopied(true);
    } catch {
      /* clipboard blocked, link is still there to copy by hand */
    }
    onShared();
  }

  function done() {
    onShared();
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} label="Share record" width={640}>
      <div className={styles.body}>
        <h2 className={styles.title}>Share record</h2>
        <p className={styles.patient}>
          {call.patientName ?? UNNAMED} <span className={styles.callId}>{call.callId}</span>
        </p>

        <div className={styles.to}>
          <span className={styles.toMark} aria-hidden="true">P</span>
          <div className={styles.toText}>
            <p className={styles.toName}>{PARAMEDIC_UNIT} · attending paramedic</p>
            <p className={styles.toNote}>Goes to the role, not a person. Whoever is attending this call gets it.</p>
          </div>
        </div>

        <div className={styles.stages}>
          <div className={styles.stage}>
            <p className={styles.stageTitle}>Right away</p>
            <p className={styles.stageBody}>Scene safety, dispatch and the call so far</p>
          </div>
          <div className={styles.stage}>
            <p className={styles.stageTitle}>Once they accept</p>
            <p className={styles.stageBody}>Name, history, photos and the full ePCR</p>
          </div>
        </div>

        <label className={styles.input}>
          <span className={styles.inputLabel}>Or send the link</span>
          <span className={styles.linkRow}>
            <input className={styles.inputSurface} readOnly value={HANDOFF_LINK} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="secondary" onClick={copyLink}>
              <Icon name="link" width={18} height={15} />
              {copied ? "Copied" : "Copy"}
            </Button>
          </span>
          <span className={styles.inputHint}>Copying the link doesn&rsquo;t change who can open the record.</span>
        </label>

        <div className={styles.actions}>
          <Button variant="ghostInk" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={done}>Share with {PARAMEDIC_UNIT}</Button>
        </div>
      </div>
    </Dialog>
  );
}
