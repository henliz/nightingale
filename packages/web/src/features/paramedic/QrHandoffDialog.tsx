import { Button } from "../../components/ui/Button/Button";
import { Dialog } from "../../components/ui/Dialog/Dialog";
import { handoffUrl } from "../../data/handoff";
import { useLiveSource } from "../../api/LiveSourceContext";
import { UNNAMED } from "../../api/call";
import { PARAMEDIC_UNIT } from "../../data/users";
import { useIncident } from "../../incident/IncidentContext";
import { useQrSvg } from "../../lib/useQrSvg";
import styles from "./QrHandoffDialog.module.css";

interface QrHandoffDialogProps {
  open: boolean;
  version: number;
  onPrint: () => void;
  onClose: () => void;
}

/** paramedic step 6 overlay: triage nurse scans this to open the read-only summary */
export function QrHandoffDialog({ open, version, onPrint, onClose }: QrHandoffDialogProps) {
  const incident = useIncident();
  const { call } = useLiveSource();
  const url = handoffUrl();
  const svg = useQrSvg(url);

  const openedLabel = incident.handoffOpenedAt ? `Opened by hospital ${incident.handoffOpenedAt}` : "Not yet opened by hospital";
  const openHandoff = () => window.open(url, "_blank", "noopener");

  return (
    <Dialog open={open} onClose={onClose} label="Hospital handoff QR code" width={640}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <h2 className={styles.title}>Hospital handoff</h2>
          <div className={styles.chips}>
            <span className={styles.chip}>{call.callId}</span>
            <span className={styles.chip}>{call.patientName ?? UNNAMED}</span>
            <span className={styles.chip}>{`Verified ${incident.times.verified ?? ""}`}</span>
            <span className={styles.chip}>{`Rick · ${PARAMEDIC_UNIT}`}</span>
          </div>
        </div>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </header>

      <div className={styles.body}>
        <button type="button" className={styles.qr} onClick={openHandoff} aria-label="Open the handoff page the nurse sees">
          {svg ? <span dangerouslySetInnerHTML={{ __html: svg }} /> : null}
        </button>
        <p className={styles.caption}>Scan to open a secure, read-only handoff page</p>
        <p className={styles.lede}>
          Opens in any browser, no hospital account or Medfi access needed. One-time link, expires in 4 hours, every open is logged. Summary
          reads in IMIST-AMBO order; identity unlocks when the nurse confirms receipt.
        </p>
        <span className={styles.pill}>{`Secure link · Version ${version} · ${openedLabel}`}</span>
        <button type="button" className={styles.link} onClick={openHandoff}>
          Prototype: click the QR code to see what the nurse opens
        </button>
      </div>

      <footer className={styles.footer}>
        <Button variant="secondary" onClick={onPrint}>
          Print Letter page
        </Button>
        <Button onClick={onClose}>Done</Button>
      </footer>
    </Dialog>
  );
}
