import { useEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode } from "react";
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
    if (open && !el.open) {
      el.showModal();
      // showModal focuses the first field (the record search); start on the dialog itself instead
      el.focus();
    } else if (!open && el.open) el.close();
  }, [open]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      tabIndex={-1}
      // size via vars, not inline width/height, so tablets + phones can go full screen
      style={{ "--dialog-w": `${width}px`, "--dialog-h": height ? `${height}px` : "auto" } as CSSProperties}
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
