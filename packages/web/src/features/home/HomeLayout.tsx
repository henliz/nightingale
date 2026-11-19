import { useState, type ReactNode } from "react";
import { AppShell } from "../../components/layout/AppShell/AppShell";
import { Button } from "../../components/ui/Button/Button";
import { LabelledSection } from "../../components/ui/Card/Card";
import { apiProblem } from "../../api/client";
import { useLiveSource } from "../../api/LiveSourceContext";
import type { User } from "../../data/users";
import { greetingFor, longDate } from "../../lib/time";
import { useNow } from "../../lib/useNow";
import styles from "./HomeLayout.module.css";

interface HomeLayoutProps {
  user: User;
  currentCall: ReactNode;
  review: ReactNode;
  /** gets the app bar search text so the list can filter */
  records: (query: string) => ReactNode;
  /** dialogs + overlays */
  children?: ReactNode;
}

/** greeting, current call beside what needs review, then recent records. same shape for every role */
export function HomeLayout({ user, currentCall, review, records, children }: HomeLayoutProps) {
  const [query, setQuery] = useState("");
  const live = useLiveSource();
  const sourceNote =
    live.source === "demo"
      ? "Showing the sample call."
      : live.status === "error"
        ? live.problem === "signed-out"
          ? "This device has no API key for you, so real calls are locked. Ask whoever runs the API for one."
          : live.problem === "forbidden"
            ? "Your account can't open real calls."
            : "Can't reach the API right now, so real calls and New call are paused."
        : live.status === "loading"
          ? "Connecting to the API…"
          : null;
  const [starting, setStarting] = useState<"idle" | "starting" | "failed" | "forbidden">("idle");
  const newCall = async () => {
    setStarting("starting");
    try {
      await live.startNewCall();
      setStarting("idle");
    } catch (e) {
      // only keys with admin can open a call (security branch), so a 403 means this role can't
      setStarting(apiProblem(e) === "forbidden" ? "forbidden" : "failed");
    }
  };
  return (
    <AppShell user={user} search={{ value: query, onChange: setQuery }}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.heroText}>
            <h1 className={styles.title}>
              {greetingFor()}, {user.firstName}
            </h1>
            <p className={styles.context}>
              <span className={styles.contextItem}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="2.3" y="3.2" width="11.4" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M2.3 6.6h11.4M5.4 1.8v2.6M10.6 1.8v2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                {longDate()}
              </span>
              <span className={styles.contextItem}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 14.2s4.6-4.1 4.6-7.6a4.6 4.6 0 1 0-9.2 0c0 3.5 4.6 7.6 4.6 7.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  <circle cx="8" cy="6.5" r="1.7" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                {user.station}
              </span>
            </p>
          </div>
          {starting === "forbidden" ? (
            <span className={styles.heroNote}>Your account can&rsquo;t start a new call</span>
          ) : (
            <Button variant="secondary" onClick={() => void newCall()} disabled={starting === "starting" || live.status === "error"} title={live.status === "error" ? "Starting a call needs the API, which isn't reachable right now." : "Everything the device records from now on goes into a fresh call. The saved cases aren't touched."}>
              {starting === "starting" ? "Starting…" : starting === "failed" ? "Couldn't start, try again" : "New call"}
            </Button>
          )}
        </div>
        <div className={styles.statusRow} role="status">
          <LiveStatus />
          {sourceNote && (
            <span className={styles.chip}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="5.75" stroke="currentColor" strokeWidth="1.2" />
                <path d="M7 6.3v3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <circle cx="7" cy="4.4" r=".8" fill="currentColor" />
              </svg>
              {sourceNote}
            </span>
          )}
        </div>
      </header>

      <div className={styles.work}>
        <LabelledSection label="Current call">{currentCall}</LabelledSection>
        <LabelledSection label="Needs your review">{review}</LabelledSection>
      </div>

      {records(query)}
      {children}
    </AppShell>
  );
}

/** what the old dev dashboard showed up top: is the api feed open, is the pi on */
function LiveStatus() {
  const live = useLiveSource();
  const now = useNow(true);
  if (live.feedOpen === null) return null;
  const ago = live.device ? Math.max(0, Math.round((now - live.device.lastHeard) / 1000)) : null;
  // heartbeat is every 30s, so >45s quiet means the pi's off or lost wifi
  // never heard = idle grey, not an alarm; quiet or dropped = amber
  const deviceTone = ago === null ? "idle" : ago < 45 ? "on" : "stale";
  return (
    <>
      <span className={styles.chip}>
        <span className={[styles.dot, live.feedOpen ? styles.on : styles.stale].join(" ")} />
        <span className={styles.chipLabel}>Live feed</span>
        {live.feedOpen ? "Connected" : "Reconnecting…"}
      </span>
      <span className={styles.chip}>
        <span className={[styles.dot, styles[deviceTone]].join(" ")} />
        <span className={styles.chipLabel}>{live.device ? live.device.id : "Device"}</span>
        {live.device && ago !== null ? `${ago < 45 ? "On" : "Quiet"} · ${formatAgo(ago)} ago` : "Not heard yet"}
      </span>
    </>
  );
}

function formatAgo(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}
