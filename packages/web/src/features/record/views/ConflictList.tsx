import styles from "./ConflictList.module.css";

export interface RecordFlag {
  /** the epcr field it's on, so a click can go straight there */
  key: string;
  field: string;
  note: string;
}

interface ConflictListProps {
  flags: readonly RecordFlag[];
  onOpen?: (key: string) => void;
}

interface Group {
  headline: string;
  detail: string;
  fields: string[];
  key: string;
}

// same note on several fields = one row. "Age conflict: 32 by cousin..." splits into a headline + detail
function group(flags: readonly RecordFlag[]): Group[] {
  const byNote = new Map<string, Group>();
  for (const { key, field, note } of flags) {
    for (const part of note.split(" · ")) {
      const existing = byNote.get(part);
      if (existing) {
        if (!existing.fields.includes(field)) existing.fields.push(field);
        continue;
      }
      const m = /^([^:.]{2,32}):\s*(.+)$/.exec(part);
      byNote.set(part, { headline: m ? m[1]! : "", detail: m ? m[2]! : part, fields: [field], key });
    }
  }
  return [...byNote.values()];
}

/** the "check before sharing" sticker: one short row per conflict, click to fix it on the record */
export function ConflictList({ flags, onOpen }: ConflictListProps) {
  const groups = group(flags);
  return (
    <section className={styles.box} aria-label="Conflicting information">
      <header className={styles.head}>
        <span className={styles.badge}>{groups.length}</span>
        <p className={styles.title}>{groups.length === 1 ? "Conflict to check" : "Conflicts to check"} before sharing</p>
      </header>

      <ul className={styles.list}>
        {groups.map((g) => (
          <li key={g.detail} className={styles.item}>
            <button type="button" className={styles.row} onClick={() => onOpen?.(g.key)} disabled={!onOpen}>
              <span className={styles.text}>
                <span className={styles.headline}>{g.headline || g.fields.join(", ")}</span>
                <span className={styles.detail}>{g.detail}</span>
              </span>
              {onOpen && <span className={styles.fix}>Fix</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
