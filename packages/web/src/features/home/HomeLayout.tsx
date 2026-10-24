import { useState, type ReactNode } from "react";
import { AppShell } from "../../components/layout/AppShell/AppShell";
import { LabelledSection } from "../../components/ui/Card/Card";
import { useLiveSource } from "../../api/LiveSourceContext";
import { sortedSessions } from "../../api/mapNote";
import type { DrillSession } from "../../api/types";
import type { User } from "../../data/users";
import { greetingFor, longDate } from "../../lib/time";
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

const NEWEST = "__newest";
const DEMO = "__demo";

function sessionLabel(s: DrillSession): string {
  const when = new Date(s.startedAt).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const name = s.title ?? `Call ${when}`;
  return `${name} · ${s.assets.length} chunks${s.epcr ? "" : " · no ePCR yet"}`;
}

/** greeting, current call beside what needs review, then recent records. same shape for every role */
export function HomeLayout({ user, currentCall, review, records, children }: HomeLayoutProps) {
  const [query, setQuery] = useState("");
  const live = useLiveSource();
  const sourceLine =
    live.source === "api" && live.status === "error"
      ? ` · api unreachable (${live.error}), showing demo data`
      : live.source === "api" && live.status === "loading"
        ? " · connecting to the api…"
        : "";
  return (
    <AppShell user={user} search={{ value: query, onChange: setQuery }}>
      <header className={styles.greeting}>
        <h1 className={styles.title}>
          {greetingFor()}, {user.firstName}
        </h1>
        <p className={styles.context}>
          {longDate()} | {user.station}
          {" · "}
          <select
            className={styles.picker}
            aria-label="Which call to show"
            value={live.source === "demo" ? DEMO : (live.pinned ?? NEWEST)}
            onChange={(e) => {
              const v = e.target.value;
              live.setSource(v === DEMO ? "demo" : "api");
              if (v !== DEMO) live.selectSession(v === NEWEST ? null : v);
            }}
          >
            <option value={NEWEST}>
              Newest call (follows live){live.source === "api" && !live.pinned && live.session ? `: ${sessionLabel(live.session)}` : ""}
            </option>
            {sortedSessions(live.sessions).map((s) => (
              <option key={s.captureId} value={s.captureId}>
                {sessionLabel(s)}
              </option>
            ))}
            <option value={DEMO}>Demo case (sample data)</option>
          </select>
          {sourceLine}
        </p>
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
