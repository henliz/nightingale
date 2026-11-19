import { useEffect, useState } from "react";
import type { Alert } from "../../../incident/alerts";
import { Icon } from "../../ui/Icon/Icon";
import styles from "./NotificationPanel.module.css";

type Filter = "all" | Alert["source"];

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "fire", label: "Firefighter" },
  { id: "paramedic", label: "Paramedic" },
  { id: "handoff", label: "Handoff" },
];

interface NotificationPanelProps {
  alerts: Alert[];
  unseen: number;
  onOpen: () => void;
  onDismiss: (ids: string[]) => void;
}

/** the bell + its count, and the right-hand panel it opens: today, yesterday, dismissable */
export function NotificationPanel({ alerts, unseen, onOpen, onDismiss }: NotificationPanelProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function show() {
    setOpen(true);
    onOpen();
  }

  const visible = alerts.filter((a) => filter === "all" || a.source === filter);
  const today = visible.filter((a) => a.day === "today");
  const yesterday = visible.filter((a) => a.day === "yesterday");

  return (
    <>
      <button
        type="button"
        className={styles.bell}
        onClick={show}
        aria-label={unseen > 0 ? `${unseen} new notifications` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon name="bellPlain" width={19} height={20} />
        {unseen > 0 ? <span className={styles.badge}>{unseen > 9 ? "9+" : unseen}</span> : <span className={styles.badgeDot} />}
      </button>

      {open && (
        <>
          <div className={styles.scrim} onClick={() => setOpen(false)} />
          <aside className={styles.panel} role="dialog" aria-label="Notifications" aria-modal="true">
            <div className={styles.head}>
              <h2 className={styles.title}>Notifications</h2>
              {visible.length > 0 && (
                <button type="button" className={styles.clearAll} onClick={() => onDismiss(visible.map((a) => a.id))}>
                  Clear all
                </button>
              )}
              <button type="button" className={styles.close} aria-label="Close notifications" onClick={() => setOpen(false)}>
                <CloseGlyph />
              </button>
            </div>
            <div className={styles.filters}>
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={[styles.filter, filter === f.id ? styles.filterActive : ""].join(" ")}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className={styles.scroll}>
              {visible.length === 0 && (
                <div className={styles.empty}>
                  <span className={styles.emptyIcon}>
                    <Icon name="bellPlain" width={17} height={18} />
                  </span>
                  <p className={styles.emptyTitle}>You're all caught up</p>
                  <p className={styles.emptyBody}>Updates from the call will show up here.</p>
                </div>
              )}
              <Group label="Today" alerts={today} onDismiss={onDismiss} />
              <Group label="Yesterday" alerts={yesterday} onDismiss={onDismiss} />
            </div>
          </aside>
        </>
      )}
    </>
  );
}

const SOURCE_LABEL: Record<Alert["source"], string> = { fire: "Firefighter", paramedic: "Paramedic", handoff: "Handoff" };

function Group({ label, alerts, onDismiss }: { label: string; alerts: Alert[]; onDismiss: (ids: string[]) => void }) {
  if (alerts.length === 0) return null;
  const tileClass = { fire: styles.tileFire, paramedic: styles.tileParamedic, handoff: styles.tileHandoff } as const;
  return (
    <section aria-label={label}>
      <p className={styles.day}>{label}</p>
      {alerts.map((a) => (
        <div key={a.id} className={styles.item}>
          <span className={[styles.tile, tileClass[a.source]].join(" ")} role="img" aria-label={SOURCE_LABEL[a.source]}>
            <SourceGlyph source={a.source} />
          </span>
          <div className={styles.body}>
            <span className={styles.itemTitle}>{a.title}</span>
            <span className={styles.itemBody}>{a.body}</span>
          </div>
          <div className={styles.meta}>
            <span className={styles.itemTime}>{a.time}</span>
            <button type="button" className={styles.dismiss} aria-label={`Dismiss: ${a.title}`} onClick={() => onDismiss([a.id])}>
              <CloseGlyph size={10} />
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function CloseGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SourceGlyph({ source }: { source: Alert["source"] }) {
  const common = { width: 18, height: 18, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true } as const;
  if (source === "fire")
    return (
      <svg {...common}>
        <path d="M8 14.5c2.6 0 4.5-1.8 4.5-4.4 0-2.7-2.3-4.3-3.1-7.6-1.6 1.1-2.4 2.6-2.4 4.1-.6-.5-1-1.2-1.1-2C4.4 5.7 3.5 7.6 3.5 10.1c0 2.6 1.9 4.4 4.5 4.4Z" fill="currentColor" />
      </svg>
    );
  if (source === "paramedic")
    return (
      <svg {...common}>
        <path d="M6.2 2.5h3.6v3.7h3.7v3.6H9.8v3.7H6.2V9.8H2.5V6.2h3.7V2.5Z" fill="currentColor" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M3 5.5h9.5m0 0L10 3m2.5 2.5L10 8M13 10.5H3.5m0 0L6 8m-2.5 2.5L6 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
