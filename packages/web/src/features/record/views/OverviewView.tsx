import { useState } from "react";
import { Alert } from "../../../components/ui/Alert/Alert";
import { Button } from "../../../components/ui/Button/Button";
import { Chip } from "../../../components/ui/Chip/Chip";
import { Field } from "../../../components/ui/Field/Field";
import type { PatientRecord } from "../../../data/record";
import { PhotoViewer } from "./PhotoViewer";
import styles from "./views.module.css";

interface OverviewViewProps {
  record: PatientRecord;
  /** flagged fields + why, "Age: 32 per cousin vs 57 per responder" */
  flags?: readonly string[];
  deviceActive: boolean;
  deviceElapsed: string | null;
  onAddObservation: () => void;
  onViewTimeline: () => void;
  onViewFiles: () => void;
}

export function OverviewView({ record, flags = [], deviceActive, deviceElapsed, onAddObservation, onViewTimeline, onViewFiles }: OverviewViewProps) {
  const hasFiles = record.files.length > 0;
  const photos = record.files.filter((f) => f.url);
  const [viewing, setViewing] = useState<number | null>(null);
  return (
    <div className={styles.view}>
      <div className={styles.headingRow}>
        <h3 className={styles.heading}>Latest observations</h3>
        {deviceActive ? (
          <>
            <Chip tone="active">Nightingale active {deviceElapsed}</Chip>
            <Chip>Online</Chip>
          </>
        ) : (
          <Chip>Nightingale inactive</Chip>
        )}
        <span className={styles.spacer} />
        <Button onClick={onAddObservation}>Add observation</Button>
      </div>

      {flags.length > 0 && <Alert tone="warning" title={`${flags.length} field${flags.length === 1 ? "" : "s"} need a look before sharing`} body={flags.join(" · ")} />}

      <div className={styles.columns}>
        <div className={styles.column}>
          <div className={styles.note}>
            <p className={styles.noteSource}>{record.latestNote.source}</p>
            <p className={styles.noteText}>{record.latestNote.text}</p>
          </div>
          <dl className={styles.readings} style={{ margin: 0 }}>
            {record.readings.map((r) => (
              <div key={r.label} className={styles.reading}>
                <dt className={styles.readingLabel}>{r.label}</dt>
                <dd className={styles.readingValue} style={{ margin: 0 }}>
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
          <div>
            <Button variant="ghostInk" onClick={onViewTimeline}>
              View care timeline
            </Button>
          </div>
          <div className={styles.divider} />
          <h3 className={styles.heading}>Medical background</h3>
          {record.medicalBackground.map((f) => (
            <Field key={f.label} label={f.label} value={f.value} />
          ))}
        </div>

        <div className={styles.columnTight}>
          <h3 className={styles.heading}>Scene account</h3>
          {record.sceneAccount.map((f) => (
            <Field key={f.label} label={f.label} value={f.value} />
          ))}
          {photos.length > 0 && (
            <div className={styles.photoStrip}>
              {photos.map((p, i) => (
                <button key={p.name} type="button" className={styles.thumbButton} onClick={() => setViewing(i)} aria-label={`Open scene photo ${i + 1}`}>
                  <img className={styles.thumb} src={p.url} alt="" />
                </button>
              ))}
            </div>
          )}
          <div>
            <Button variant="ghostInk" onClick={onViewFiles} disabled={!hasFiles}>
              View documents and images
            </Button>
          </div>
        </div>
      </div>
      {viewing !== null && <PhotoViewer photos={photos} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
