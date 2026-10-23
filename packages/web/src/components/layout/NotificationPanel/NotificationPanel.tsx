import { useEffect, useState } from "react";
import type { Alert } from "../../../incident/alerts";
import { Button } from "../../ui/Button/Button";
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

/** The bell with its count, and the right-hand panel it opens: today, yesterday, dismissable. */
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
        {unseen > 0 && <span className={styles.badge}>{unseen > 9 ? "9+" : unseen}</span>}
      </button>

      {open && (
        <>
          <div className={styles.scrim} onClick={() => setOpen(false)} />
          <aside className={styles.panel} role="dialog" aria-label="Notifications" aria-modal="true">
            <div className={styles.head}>
              <h2 className={styles.title}>Notifications</h2>
              {visible.length > 0 && (
                <Button variant="ghost" onClick={() => onDismiss(visible.map((a) => a.id))} style={{ height: 36 }}>
                  Clear all
                </Button>
              )}
              <Button variant="ghostInk" onClick={() => setOpen(false)} style={{ height: 36 }}>
                Close
              </Button>
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
              {visible.length === 0 && <p className={styles.empty}>You're all caught up.</p>}
              <Group label="Today" alerts={today} onDismiss={onDismiss} />
              <Group label="Yesterday" alerts={yesterday} onDismiss={onDismiss} />
            </div>
          </aside>
        </>
      )}
    </>
  );
}

function Group({ label, alerts, onDismiss }: { label: string; alerts: Alert[]; onDismiss: (ids: string[]) => void }) {
  if (alerts.length === 0) return null;
  const dotClass = { fire: styles.dotFire, paramedic: styles.dotParamedic, handoff: styles.dotHandoff } as const;
  return (
    <section aria-label={label}>
      <p className={styles.day}>{label}</p>
      {alerts.map((a) => (
        <div key={a.id} className={styles.item}>
          <span className={[styles.dot, dotClass[a.source]].join(" ")} />
          <div className={styles.body}>
            <span className={styles.itemTitle}>{a.title}</span>
            <span className={styles.itemBody}>{a.body}</span>
          </div>
          <span className={styles.itemTime}>{a.time}</span>
          <button type="button" className={styles.dismiss} aria-label={`Dismiss: ${a.title}`} onClick={() => onDismiss([a.id])}>
            ×
          </button>
        </div>
      ))}
    </section>
  );
}
