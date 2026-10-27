import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import styles from "./Dialog.module.css";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** accessible name for the dialog */
  label: string;
  width: number;
  height?: number;
  children: ReactNode;
}

// native <dialog> modal, focus trapping + escape + scrim all come free from the browser.
// clicking the scrim (outside the panel) closes it, per the design notes
export function Dialog({ open, onClose, label, width, height, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      style={{ width, height }}
      aria-label={label}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={handleBackdropClick}
    >
      {children}
    </dialog>
  );
}
