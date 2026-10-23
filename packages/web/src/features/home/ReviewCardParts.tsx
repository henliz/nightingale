import type { ReactNode } from "react";
import { Icon } from "../../components/ui/Icon/Icon";
import styles from "./ReviewCard.module.css";

export function ReviewHead({ title, children, onExpand }: { title: string; children?: ReactNode; onExpand: () => void }) {
  return (
    <div>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        <button type="button" className={styles.iconButton} onClick={onExpand} aria-label="Expand">
          <Icon name="expand" size={15} />
        </button>
      </div>
      {children && <p className={styles.meta}>{children}</p>}
    </div>
  );
}

export function ReviewExcerpt({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className={styles.excerpt}>
      <p className={styles.excerptText}>{text}</p>
      {hint && <p className={styles.excerptHint}>{hint}</p>}
    </div>
  );
}
