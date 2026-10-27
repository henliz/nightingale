import { useState, type ReactNode } from "react";
import { AppShell } from "../../components/layout/AppShell/AppShell";
import { Button } from "../../components/ui/Button/Button";
import { LabelledSection } from "../../components/ui/Card/Card";
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
  const sourceLine =
    live.source === "demo"
      ? " · Showing the sample call"
      : live.status === "error"
        ? " · Can't reach the api, real calls show up here as soon as it's running"
        : live.status === "loading"
          ? " · connecting to the api…"
          : "";
  const [starting, setStarting] = useState<"idle" | "starting" | "failed">("idle");
  const newCall = async () => {
    setStarting("starting");
    try {
      await live.startNewCall();
      setStarting("idle");
    } catch {
      setStarting("failed");
    }
  };
  return (
    <AppShell user={user} search={{ value: query, onChange: setQuery }}>
      <header className={styles.greeting}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>
            {greetingFor()}, {user.firstName}
          </h1>
          <Button variant="secondary" onClick={() => void newCall()} disabled={starting === "starting" || live.status === "error"} title="Everything the device records from now on goes into a fresh call. The saved cases aren't touched.">
            {starting === "starting" ? "Starting…" : starting === "failed" ? "Couldn't start, try again" : "New call"}
          </Button>
        </div>
        <p className={styles.context}>
          {longDate()} | {user.station}
          {sourceLine}
        </p>
        <LiveStatus />
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
  const deviceTone = ago === null ? "off" : ago < 45 ? "on" : ago < 120 ? "stale" : "off";
  return (
    <p className={styles.status}>
      <span className={styles.statusItem}>
        <span className={[styles.dot, live.feedOpen ? styles.on : styles.off].join(" ")} />
        {live.feedOpen ? "Live feed connected" : "Live feed down, retrying…"}
      </span>
      <span className={styles.statusItem}>
        <span className={[styles.dot, styles[deviceTone]].join(" ")} />
        {live.device && ago !== null ? `${live.device.id} ${ago < 45 ? "is on" : "is quiet"}, last heard ${formatAgo(ago)} ago` : "No device heard from yet"}
      </span>
    </p>
  );
}

function formatAgo(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}
