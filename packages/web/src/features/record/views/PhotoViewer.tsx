import { useEffect } from "react";
import { Button } from "../../../components/ui/Button/Button";
import type { RecordFile } from "../../../data/record";
import styles from "./PhotoViewer.module.css";

interface PhotoViewerProps {
  photos: readonly RecordFile[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}

/** a scene photo full size over the record, with its caption. arrows step through the rest */
export function PhotoViewer({ photos, index, onIndex, onClose }: PhotoViewerProps) {
  const photo = photos[index];
  const step = (by: number) => onIndex((index + by + photos.length) % photos.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") onIndex((index + 1) % photos.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onIndex]);

  if (!photo?.url) return null;
  return (
    <div className={styles.scrim} role="dialog" aria-label={`Photo ${index + 1} of ${photos.length}`} onClick={onClose}>
      <div className={styles.frame} onClick={(e) => e.stopPropagation()}>
        <div className={styles.bar}>
          <span className={styles.count}>
            Photo {index + 1} of {photos.length} · {photo.stamp}
          </span>
          {photos.length > 1 && (
            <>
              <Button variant="secondary" onClick={() => step(-1)} aria-label="Previous photo">
                ‹
              </Button>
              <Button variant="secondary" onClick={() => step(1)} aria-label="Next photo">
                ›
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        <img className={styles.image} src={photo.url} alt={photo.kind} />
        <p className={styles.caption}>{photo.kind}</p>
      </div>
    </div>
  );
}
