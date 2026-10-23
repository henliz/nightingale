import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import styles from "./Dialog.module.css";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  width: number;
  height?: number;
  children: ReactNode;
}

/**
 * Native <dialog> modal: focus trapping, Escape and the scrim all come from the browser.
 * Clicking the scrim (outside the panel) closes it, as the design annotates.
 */
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
