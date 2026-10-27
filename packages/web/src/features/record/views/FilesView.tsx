import { useState } from "react";
import { Button } from "../../../components/ui/Button/Button";
import { Icon } from "../../../components/ui/Icon/Icon";
import type { RecordFile } from "../../../data/record";
import { PhotoViewer } from "./PhotoViewer";
import styles from "./views.module.css";

interface FilesViewProps {
  files: readonly RecordFile[];
  onAddFile: () => void;
  onRemove: (file: RecordFile) => void;
}

export function FilesView({ files, onAddFile, onRemove }: FilesViewProps) {
  const photos = files.filter((f) => f.url);
  const [viewing, setViewing] = useState<number | null>(null);
  const open = (f: RecordFile) => setViewing(photos.indexOf(f));
  return (
    <div className={styles.view}>
      <div className={styles.headingRow}>
        <h3 className={styles.heading}>Documents and images</h3>
        <span className={styles.spacer} />
        <Button onClick={onAddFile}>Add file</Button>
      </div>
      <p className={styles.lede}>Forms, scene photos, medication lists and medical screenshots for this record.</p>
      {files.length === 0 ? (
        <p className={styles.hint}>No files attached yet.</p>
      ) : (
        <div className={styles.fileList}>
          {files.map((f) => (
            <div key={f.name + f.stamp} className={styles.file}>
              {f.url ? (
                // raw photos stay on the laptop that ran the drill; when the bytes are not here, fall back to the icon
                <button type="button" className={styles.thumbButton} onClick={() => open(f)} aria-label={`Open ${f.name}`}>
                  <img className={styles.thumb} src={f.url} alt="" onError={(e) => e.currentTarget.replaceWith(Object.assign(document.createElement("span"), { textContent: "" }))} />
                </button>
              ) : (
                <Icon name="file" size={24} />
              )}
              <span className={styles.fileInfo}>
                {f.url ? (
                  <button type="button" className={[styles.fileName, styles.fileLink].join(" ")} onClick={() => open(f)}>
                    {f.name}
                  </button>
                ) : (
                  <span className={styles.fileName}>{f.name}</span>
                )}
                <span className={styles.fileMeta}>{f.kind}</span>
                <span className={styles.fileMeta}>{f.stamp}</span>
              </span>
              <Button variant="ghost" onClick={() => onRemove(f)} style={{ height: 36 }} aria-label={`Remove ${f.name}`}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
      {viewing !== null && <PhotoViewer photos={photos} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
