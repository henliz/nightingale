import { useState } from "react";
import { Button } from "../../components/ui/Button/Button";
import { Dialog } from "../../components/ui/Dialog/Dialog";
import { Icon } from "../../components/ui/Icon/Icon";
import { useLiveSource } from "../../api/LiveSourceContext";
import { UNNAMED } from "../../api/call";
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
        <div className={styles.head}>
          <h2 className={styles.title}>Share record</h2>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        <p className={styles.patient}>{call.patientName ?? UNNAMED}</p>
        <p className={styles.lede}>Share this record with the paramedic crew. They must accept it before identity unlocks.</p>
        <div className={styles.access}>
          <p className={styles.accessTitle}>People with record access</p>
          <p className={styles.accessBody}>Copying the link does not change who can view the record.</p>
        </div>
        <label className={styles.input}>
          <span className={styles.inputLabel}>Record link</span>
          <input className={styles.inputSurface} readOnly value={HANDOFF_LINK} onFocus={(e) => e.currentTarget.select()} />
        </label>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={done}>
            Done
          </Button>
          <Button variant="secondary" onClick={copyLink}>
            <Icon name="link" width={18} height={15} />
            {copied ? "Link copied" : "Copy link"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
