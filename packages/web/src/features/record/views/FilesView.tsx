import { useState } from "react";
import { Button } from "../../../components/ui/Button/Button";
import { Icon } from "../../../components/ui/Icon/Icon";
import type { RecordFile } from "../../../data/record";
import { isGuessedTag, PHOTO_TAGS, photoTag, setPhotoTag, type PhotoTag } from "../../../lib/photoRows";
import { PhotoViewer } from "./PhotoViewer";
import styles from "./FilesView.module.css";

interface FilesViewProps {
  files: readonly RecordFile[];
  onAddFile: () => void;
  onRemove: (file: RecordFile) => void;
}

/** thumbnails in a grid, each tagged (scene, mechanism, injury, treatment, meds, document) so the right one is easy to find */
export function FilesView({ files, onAddFile, onRemove }: FilesViewProps) {
  const [filter, setFilter] = useState<PhotoTag | "All">("All");
  const [, bump] = useState(0);
  const tagged = files.map((f) => ({ f, tag: photoTag(f) }));
  const counts = new Map<PhotoTag, number>();
  for (const { tag } of tagged) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const shown = filter === "All" ? tagged : tagged.filter((t) => t.tag === filter);
  const photos = shown.filter((t) => t.f.url).map((t) => t.f);
  const [viewing, setViewing] = useState<number | null>(null);

  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <h3 className={styles.heading}>Documents and images</h3>
        <Button onClick={onAddFile}>Add file</Button>
      </div>

      {files.length === 0 ? (
        <p className={styles.empty}>No files attached yet. Photos from the device land here on their own.</p>
      ) : (
        <>
          <div className={styles.filters} role="group" aria-label="Filter by tag">
            {(["All", ...PHOTO_TAGS.filter((t) => counts.has(t))] as const).map((t) => (
              <button key={t} type="button" className={styles.filter} aria-pressed={filter === t} onClick={() => setFilter(t)}>
                {t}
                <span className={styles.count}>{t === "All" ? files.length : counts.get(t)}</span>
              </button>
            ))}
          </div>

          <ul className={styles.grid}>
            {shown.map(({ f, tag }) => (
              <li key={f.name + f.stamp} className={styles.tile}>
                {f.url ? (
                  <button type="button" className={styles.thumb} onClick={() => setViewing(photos.indexOf(f))} aria-label={`Open ${f.kind}`}>
                    <img src={f.url} alt="" loading="lazy" />
                  </button>
                ) : (
                  <div className={[styles.thumb, styles.doc].join(" ")}>
                    <Icon name="file" size={28} />
                  </div>
                )}
                <div className={styles.meta}>
                  <label className={styles.tagPick}>
                    <span className="sr-only">Tag for {f.name}</span>
                    <select
                      value={tag}
                      onChange={(e) => {
                        setPhotoTag(f, e.target.value as PhotoTag);
                        bump((n) => n + 1);
                      }}
                      className={[styles.tag, styles[`tag${tag}`], f.url && isGuessedTag(f) ? styles.tagGuess : ""].join(" ")}
                    >
                      {PHOTO_TAGS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  {f.url && isGuessedTag(f) && <span className={styles.suggested}>Suggested from the photo description</span>}
                  <p className={styles.caption} title={f.kind}>
                    {f.kind}
                  </p>
                  <div className={styles.foot}>
                    <span className={styles.stamp}>{f.stamp}</span>
                    <button type="button" className={styles.remove} onClick={() => onRemove(f)} aria-label={`Remove ${f.name}`}>
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {viewing !== null && <PhotoViewer photos={photos} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
