import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/ui/Button/Button";
import { Field } from "../../../components/ui/Field/Field";
import { INCIDENT_SECTIONS } from "../../../data/record";
import type { IncidentState } from "../../../incident/types";
import styles from "./views.module.css";

interface IncidentViewProps {
  /** real sections from the api, otherwise the fixture */
  sections?: readonly { title: string; fields: readonly { label: string; value: string; flag?: string; note?: string }[] }[];
  notes: IncidentState["incidentNotes"];
  onSaveNote: (section: string, text: string) => void;
}

export function IncidentView({ sections = INCIDENT_SECTIONS, notes, onSaveNote }: IncidentViewProps) {
  // every section stays open (no hunting through an accordion), a side index jumps between them
  const idFor = (title: string) => `incident-${title.replace(/\W+/g, "-").toLowerCase()}`;
  const [active, setActive] = useState<string>(sections[0]?.title ?? "");
  const scrollRef = useRef<HTMLDivElement>(null);

  // highlight whichever section is at the top of the scroll area
  useEffect(() => {
    const root = scrollRef.current?.closest("[data-scroll-root]") ?? null;
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.getAttribute("data-title") ?? "");
      },
      { root, rootMargin: "0px 0px -70% 0px" },
    );
    scrollRef.current?.querySelectorAll("[data-title]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);

  const jump = (title: string) => {
    setActive(title);
    document.getElementById(idFor(title))?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <div className={styles.segmented}>
      <nav className={styles.segNav} aria-label="ePCR sections">
        {sections.map((section) => {
          const flags = section.fields.filter((f) => f.flag).length;
          const filled = section.fields.filter((f) => f.value).length;
          return (
            <button
              key={section.title}
              type="button"
              className={styles.segLink}
              aria-current={active === section.title ? "true" : undefined}
              onClick={() => jump(section.title)}
            >
              <span className={styles.segLabel}>{section.title}</span>
              {flags > 0 ? <span className={styles.segFlag}>{flags}</span> : <span className={styles.segCount}>{filled}/{section.fields.length}</span>}
            </button>
          );
        })}
      </nav>

      <div className={styles.segBody} ref={scrollRef}>
        {sections.map((section) => {
          const note = notes[section.title];
          return (
            <section key={section.title} id={idFor(section.title)} data-title={section.title} className={styles.segment} aria-label={section.title}>
              <h3 className={styles.segTitle}>{section.title}</h3>
              <div className={styles.segFields}>
                {section.fields.length === 0 ? (
                  <p className={styles.hint}>Nothing recorded for this section.</p>
                ) : (
                  section.fields.map((f) => <Field key={f.label} label={f.label} value={f.value} flag={f.flag} note={f.note} />)
                )}
              </div>
              <SectionNote section={section.title} note={note} onSave={onSaveNote} />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SectionNote({
  section,
  note,
  onSave,
}: {
  section: string;
  note: IncidentState["incidentNotes"][string] | undefined;
  onSave: (section: string, text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note?.text ?? "");

  if (!editing) {
    return (
      <div className={styles.noteRow}>
        {note ? (
          <div className={styles.note} style={{ flex: 1 }}>
            <p className={styles.noteSource}>Note by {note.by} at {note.at}</p>
            <p className={styles.noteText}>{note.text}</p>
          </div>
        ) : null}
        <Button variant="ghostInk" onClick={() => setEditing(true)} style={{ height: 36 }}>
          {note ? "Edit note" : "Add a note"}
        </Button>
      </div>
    );
  }
  return (
    <div className={styles.noteRow} style={{ flexDirection: "column", alignItems: "stretch" }}>
      <label className={styles.input}>
        <span className={styles.inputLabel}>Note for {section}</span>
        <textarea className={[styles.inputSurface, styles.textarea].join(" ")} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className={styles.actions}>
        <Button
          onClick={() => {
            onSave(section, text.trim());
            setEditing(false);
          }}
          disabled={!text.trim()}
        >
          Save note
        </Button>
        <Button variant="secondary" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
