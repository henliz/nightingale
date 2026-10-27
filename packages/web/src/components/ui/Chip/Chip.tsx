import type { ReactNode } from "react";
import styles from "./Chip.module.css";

export type ChipTone = "neutral" | "active" | "warning";

export function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: ReactNode }) {
  return <span className={[styles.chip, styles[tone]].join(" ")}>{children}</span>;
}
