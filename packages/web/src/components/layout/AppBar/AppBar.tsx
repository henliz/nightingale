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
        {/* no api keys = the api's insecure dev mode, fictional drills only (SECURITY-DEMO.md) */}
        {!__NG_SECURED__ && (
          <span className={styles.drillBadge} title="The api is running without keys. Fictional drill data only, never real patients.">
            Fictional drill data
          </span>
        )}
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
