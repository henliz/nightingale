import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { useLiveSource } from "../../../api/LiveSourceContext";
import type { User } from "../../../data/users";
import { alertsFor, unseenCount } from "../../../incident/alerts";
import { useIncident, useIncidentDispatch } from "../../../incident/IncidentContext";
import { useSession } from "../../../session/SessionContext";
import { AppBar } from "../AppBar/AppBar";
import styles from "./AppShell.module.css";

interface AppShellProps {
  user: User;
  /** "compact" uses the 24px gutter from the record review frames */
  density?: "default" | "compact";
  search?: { value: string; onChange: (value: string) => void };
  children: ReactNode;
}

/** app bar + the scrollable workspace under it */
export function AppShell({ user, density = "default", search, children }: AppShellProps) {
  const { signOut } = useSession();
  const incident = useIncident();
  const dispatch = useIncidentDispatch();
  const navigate = useNavigate();
  const live = useLiveSource();

  const alerts = alertsFor(user.role, incident, live.call, live.source === "demo");

  function handleSignOut() {
    signOut();
    navigate("/", { replace: true });
  }

  function handleRestart() {
    dispatch({ type: "reset" });
    signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className={styles.shell}>
      <AppBar
        user={user}
        alerts={alerts}
        unseenCount={unseenCount(alerts, incident)}
        search={search}
        onAlertsOpened={() => dispatch({ type: "alerts_seen", ids: alerts.map((a) => a.id) })}
        onDismissAlerts={(ids) => dispatch({ type: "alerts_dismissed", ids })}
        onSignOut={handleSignOut}
        onRestartDemo={handleRestart}
      />
      <div className={styles.scroll}>
        <main className={[styles.content, density === "compact" ? styles.compact : ""].join(" ")}>{children}</main>
      </div>
    </div>
  );
}
