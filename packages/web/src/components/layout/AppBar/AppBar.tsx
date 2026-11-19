import { useEffect, useRef } from "react";
import type { User } from "../../../data/users";
import type { Alert } from "../../../incident/alerts";
import { Icon } from "../../ui/Icon/Icon";
import { Logo } from "../../ui/Logo/Logo";
import { NotificationPanel } from "../NotificationPanel/NotificationPanel";
import { ProfileMenu } from "../ProfileMenu/ProfileMenu";
import styles from "./AppBar.module.css";

interface AppBarProps {
  user: User;
  alerts: Alert[];
  unseenCount: number;
  search?: { value: string; onChange: (value: string) => void };
  onAlertsOpened: () => void;
  onDismissAlerts: (ids: string[]) => void;
  onSignOut: () => void;
  onRestartDemo: () => void;
}

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function AppBar({ user, alerts, unseenCount, search, onAlertsOpened, onDismissAlerts, onSignOut, onRestartDemo }: AppBarProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (IS_MAC ? e.metaKey : e.ctrlKey)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <Logo width={38} height={24} />
        <span className={styles.brandName}>Nightingale</span>
        {/* no api keys = the api's insecure dev mode, fictional drills only (SECURITY-DEMO.md) */}
        {!__NG_SECURED__ && (
          <span className={styles.drillBadge} title="The api is running without keys. Fictional drill data only, never real patients.">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M5.2 1.75h3.6M5.8 1.75v3.6L2.6 10.9a1 1 0 0 0 .87 1.5h7.06a1 1 0 0 0 .87-1.5L8.2 5.35v-3.6M4.1 8.4h5.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={styles.drillLabel}>Drill data</span>
          </span>
        )}
      </div>

      <div className={styles.right}>
        <label className={styles.search}>
          <Icon name="search" size={16} className={styles.searchIcon} />
          <input
            ref={searchRef}
            className={styles.searchInput}
            type="search"
            placeholder="Search records"
            aria-label="Search records"
            aria-keyshortcuts={IS_MAC ? "Meta+K" : "Control+K"}
            value={search?.value ?? ""}
            onChange={(e) => search?.onChange(e.target.value)}
            readOnly={!search}
          />
          <kbd className={styles.kbd} aria-hidden="true">
            {IS_MAC ? "⌘" : "Ctrl"} K
          </kbd>
        </label>

        <ProfileMenu user={user} onSignOut={onSignOut} onRestartDemo={onRestartDemo} />

        <NotificationPanel alerts={alerts} unseen={unseenCount} onOpen={onAlertsOpened} onDismiss={onDismissAlerts} />
      </div>
    </header>
  );
}
