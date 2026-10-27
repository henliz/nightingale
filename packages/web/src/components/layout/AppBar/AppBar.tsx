import type { User } from "../../../data/users";
import type { Alert } from "../../../incident/alerts";
import { Icon } from "../../ui/Icon/Icon";
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

export function AppBar({ user, alerts, unseenCount, search, onAlertsOpened, onDismissAlerts, onSignOut, onRestartDemo }: AppBarProps) {
  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <Icon name="logo" size={29} />
        <span className={styles.brandName}>Nightingale</span>
      </div>

      <div className={styles.right}>
        <label className={styles.search}>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Search records"
            aria-label="Search records"
            value={search?.value ?? ""}
            onChange={(e) => search?.onChange(e.target.value)}
            readOnly={!search}
          />
          <Icon name="search" size={16} />
        </label>

        <ProfileMenu user={user} onSignOut={onSignOut} onRestartDemo={onRestartDemo} />

        <NotificationPanel alerts={alerts} unseen={unseenCount} onOpen={onAlertsOpened} onDismiss={onDismissAlerts} />
      </div>
    </header>
  );
}
