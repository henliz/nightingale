import { useState } from "react";
import { Button } from "../../../components/ui/Button/Button";
import { Icon } from "../../../components/ui/Icon/Icon";
import { PATIENT } from "../../../data/record";
import type { AddedFile } from "../../../incident/types";
import { clockTime } from "../../../lib/time";
import styles from "./views.module.css";

interface UploadViewProps {
  addedBy: string;
  onAttach: (file: AddedFile) => void;
  onCancel: () => void;
}

export function UploadView({ addedBy, onAttach, onCancel }: UploadViewProps) {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className={styles.view}>
      <h3 className={styles.heading}>Import a file or recording</h3>
      <p className={styles.recordNumber}>Record {PATIENT.recordNumber}</p>
      <p className={styles.lede}>Check that the file belongs to this patient before attaching it.</p>
      <div className={styles.dropzone}>
        <Icon name="file" size={24} />
        <p className={styles.eventTitle}>{fileName ?? "No file selected"}</p>
        <p className={styles.hint}>PDF, JPG, PNG, M4A or MP3</p>
        <label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.m4a,.mp3"
            hidden
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <Button variant="secondary" onClick={(e) => (e.currentTarget.parentElement as HTMLLabelElement).querySelector("input")?.click()}>
            Choose file
          </Button>
        </label>
      </div>
      <div className={styles.actions}>
        {fileName && (
          <Button onClick={() => onAttach({ id: crypto.randomUUID(), name: fileName, addedBy, at: clockTime() })}>Attach file</Button>
        )}
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
