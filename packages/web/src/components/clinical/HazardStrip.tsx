import styles from "./HazardStrip.module.css";

/**
 * scene safety goes first, always shown, even when nothing was flagged (p26: medics defer to fire on "am i safe").
 * inline = one item in a meta line; standalone = its own row, and a hazard gets a red panel so it can't be missed
 */
export function HazardStrip({ hazards, inline = false }: { hazards: string; inline?: boolean }) {
  const text = hazards.replace(/^Scene safety and hazards:\s*/i, "").trim();
  const none = !text || /^(none|no hazards|none mentioned)/i.test(text);
  return (
    <span
      className={[styles.safety, none ? styles.safe : styles.danger, inline ? styles.inline : styles.standalone].join(" ")}
      role={none ? "status" : "alert"}
    >
      <svg className={styles.icon} width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M9 1.9 3.2 4.1v4.3c0 3.6 2.4 6.6 5.8 7.7 3.4-1.1 5.8-4.1 5.8-7.7V4.1L9 1.9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        {none ? (
          <path d="m6.4 9.1 1.8 1.8 3.5-3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M9 5.9v3.4M9 11.7v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        )}
      </svg>
      {none ? "No hazards on scene" : `Hazard: ${text}`}
    </span>
  );
}
