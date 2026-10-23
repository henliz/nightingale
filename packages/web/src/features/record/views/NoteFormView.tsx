import { useState, type FormEvent } from "react";
import { Button } from "../../../components/ui/Button/Button";
import { Field } from "../../../components/ui/Field/Field";
import { PATIENT } from "../../../data/record";
import type { AddedObservation } from "../../../incident/types";
import { clockTime } from "../../../lib/time";
import styles from "./views.module.css";

interface NoteFormViewProps {
  recordedBy: string;
  onSave: (observation: AddedObservation) => void;
  onCancel: () => void;
}

const MEASUREMENTS = [
  ["pulse", "Pulse (bpm)"],
  ["respiratoryRate", "Respiratory rate (/min)"],
  ["bloodPressure", "Blood pressure (mmHg)"],
  ["spo2", "SpO2 (%)"],
  ["gcs", "GCS (/15)"],
] as const;

export function NoteFormView({ recordedBy, onSave, onCancel }: NoteFormViewProps) {
  const [observedAt, setObservedAt] = useState(clockTime);
  const [note, setNote] = useState("");
  const [measurements, setMeasurements] = useState<AddedObservation["measurements"]>({});

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!note.trim()) return;
    onSave({ id: crypto.randomUUID(), observedAt, note: note.trim(), measurements, recordedBy });
  }

  return (
    <form className={styles.view} onSubmit={handleSubmit}>
      <h3 className={styles.heading}>Review observation</h3>
      <p className={styles.lede}>Check the captured note and add any measurements you recorded.</p>
      <div className={styles.formRow}>
        <Field label="Recorded by" value={recordedBy} />
        <Field label="Patient" value={PATIENT.name} />
      </div>
      <label className={styles.input} style={{ width: 240 }}>
        <span className={styles.inputLabel}>Observed at *</span>
        <input className={styles.inputSurface} type="time" required value={observedAt} onChange={(e) => setObservedAt(e.target.value)} />
      </label>
      <label className={styles.input}>
        <span className={styles.inputLabel}>Observation note *</span>
        <textarea className={[styles.inputSurface, styles.textarea].join(" ")} required value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <p className={styles.eventTitle}>Measurements if recorded</p>
      <div className={styles.formRow} style={{ flexWrap: "wrap" }}>
        {MEASUREMENTS.map(([key, label]) => (
          <label key={key} className={styles.input} style={{ width: 320 }}>
            <span className={styles.inputLabel}>{label}</span>
            <input
              className={styles.inputSurface}
              placeholder="Not recorded"
              value={measurements[key] ?? ""}
              onChange={(e) => setMeasurements({ ...measurements, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <div className={styles.actions}>
        <Button type="submit">Save observation</Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
