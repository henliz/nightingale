import { createPortal } from "react-dom";
import { Button } from "../../components/ui/Button/Button";
import { Dialog } from "../../components/ui/Dialog/Dialog";
import { useIncident } from "../../incident/IncidentContext";
import { PrintableEpcr } from "./PrintableEpcr";
import styles from "./PrintEpcrDialog.module.css";

interface PrintEpcrDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Overlay D: one Letter page preview, printed through the browser's print dialog. */
export function PrintEpcrDialog({ open, onClose }: PrintEpcrDialogProps) {
  const incident = useIncident();
  // Each confirmed field bumps the version so the hospital can tell copies apart.
  const version = 1 + Object.keys(incident.fieldReviews).length;

  return (
    <>
      <Dialog open={open} onClose={onClose} label="Print ePCR" width={1184} height={804}>
        <div className={styles.body}>
          <div className={styles.head}>
            <h2 className={styles.title}>Print ePCR</h2>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
          <div className={styles.toolbar}>
            <span className={styles.pageInfo}>1 page / Letter</span>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => window.print()}>Print</Button>
          </div>
          <div className={styles.preview}>
            <PrintableEpcr incident={incident} version={version} />
          </div>
        </div>
      </Dialog>
      {open &&
        createPortal(
          <div className={styles.sheet}>
            <PrintableEpcr incident={incident} version={version} />
          </div>,
          document.body,
        )}
    </>
  );
}
