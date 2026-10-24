import { useState, type ReactNode } from "react";
import { AppShell } from "../../components/layout/AppShell/AppShell";
import { LabelledSection } from "../../components/ui/Card/Card";
import { useLiveSource } from "../../api/LiveSourceContext";
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

/** greeting, current call beside what needs review, then recent records. same shape for every role */
export function HomeLayout({ user, currentCall, review, records, children }: HomeLayoutProps) {
  const [query, setQuery] = useState("");
  const live = useLiveSource();
  const sourceLine =
    live.source === "demo"
      ? " · Showing the sample call"
      : live.status === "error"
        ? ` · api unreachable (${live.error})`
        : live.status === "loading"
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
