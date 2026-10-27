import { useState } from "react";
import { Button } from "../../../components/ui/Button/Button";
import { Field } from "../../../components/ui/Field/Field";
import { Icon } from "../../../components/ui/Icon/Icon";
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
  const [openTitle, setOpenTitle] = useState<string | null>(sections[0]?.title ?? null);

  return (
    <div className={styles.view}>
      <h3 className={styles.heading}>Patient and incident details</h3>
      <p className={styles.lede}>Keep call reporting alongside the patient record. Open only the sections needed for this incident.</p>
      {sections.map((section) => {
        const open = openTitle === section.title;
        const panelId = `incident-${section.title.replace(/\W+/g, "-").toLowerCase()}`;
        const note = notes[section.title];
        return (
          <div key={section.title} className={styles.accordion}>
            <button
              type="button"
              className={styles.accordionHead}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpenTitle(open ? null : section.title)}
            >
              <span className={styles.accordionHeadLabel}>{section.title}</span>
              {note && <span className={styles.hint}>Note added</span>}
              <Icon name="chevron" size={18} className={open ? styles.chevronOpen : undefined} />
            </button>
            {open && (
              <div id={panelId}>
                <div className={styles.accordionBody}>
                  {section.fields.length === 0 ? (
                    <p className={styles.hint}>Nothing recorded for this section.</p>
                  ) : (
                    section.fields.map((f) => <Field key={f.label} label={f.label} value={f.value} flag={f.flag} note={f.note} />)
                  )}
                </div>
                <SectionNote section={section.title} note={note} onSave={onSaveNote} />
              </div>
            )}
          </div>
        );
      })}
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
