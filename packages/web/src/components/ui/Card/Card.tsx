import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={[styles.card, className].filter(Boolean).join(" ")} {...rest} />;
}

/** labelled column, muted heading above a card */
export function LabelledSection({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={[styles.section, className].filter(Boolean).join(" ")}>
      <p className={styles.sectionLabel}>{label}</p>
      {children}
    </div>
  );
}
