import styles from "./HazardStrip.module.css";

/** scene safety goes first, always shown, even when nothing was flagged (p26: medics defer to fire on "am i safe") */
export function HazardStrip({ hazards }: { hazards: string }) {
  const text = hazards.replace(/^Scene safety and hazards:\s*/i, "").trim();
  const none = !text || /^(none|no hazards|none mentioned)/i.test(text);
  return (
    <div className={[styles.strip, none ? styles.clear : styles.danger].join(" ")} role={none ? "status" : "alert"}>
      <span className={styles.icon} aria-hidden="true">
        {none ? "✓" : "!"}
      </span>
      <span className={styles.label}>Scene safety</span>
      <span className={styles.text}>{none ? "No hazards mentioned on scene" : text}</span>
    </div>
  );
}
