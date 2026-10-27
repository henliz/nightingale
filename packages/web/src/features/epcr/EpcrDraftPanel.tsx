import { Button } from "../../components/ui/Button/Button";
import type { EpcrSection, EpcrTab } from "../../data/epcr";
import type { IncidentState } from "../../incident/types";
import { resolveField } from "../../incident/selectors";
import { EpcrField } from "./EpcrField";
import styles from "./EpcrDraftPanel.module.css";

interface EpcrDraftPanelProps {
  tabs: readonly { id: EpcrTab; label: string }[];
  sections: readonly EpcrSection[];
  tab: EpcrTab;
  onTabChange: (tab: EpcrTab) => void;
  incident: IncidentState;
  selectedKey: string | null;
  onSelectField: (key: string) => void;
  onOpenField: (key: string) => void;
  onToggleCheckbox: (key: string, checked: boolean) => void;
  /** field keys that still need attention, their tabs get a red dot */
  attentionKeys?: ReadonlySet<string>;
  draftStatus: string;
  saveLabel: string;
  savePrimary?: boolean;
  onSave: () => void;
}

export function EpcrDraftPanel(props: EpcrDraftPanelProps) {
  const { tabs, sections, tab, onTabChange, incident, selectedKey, onSelectField, onOpenField, onToggleCheckbox, draftStatus, saveLabel, onSave } = props;
  const attentionKeys = props.attentionKeys ?? new Set<string>();
  const visible = sections.filter((s) => s.tab === tab);
  const tabsNeedingAttention = new Set(
    sections.filter((s) => s.fields.some((f) => attentionKeys.has(f.key))).map((s) => s.tab),
  );

  return (
    <section className={styles.panel} aria-label="ePCR draft">
      <div className={styles.header}>
        <h2 className={styles.title}>ePCR</h2>
        <span className={styles.confidential}>Confidential Electronic Information Record</span>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Record sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={[styles.tab, tab === t.id ? styles.tabActive : ""].join(" ")}
            onClick={() => onTabChange(t.id)}
          >
            {tabsNeedingAttention.has(t.id) && <span className={styles.tabDot} aria-label="Needs attention" />}
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.scroll}>
        {visible.map((section) => (
          <div key={section.title} className={styles.section}>
            <h3 className={[styles.sectionTitle, section.titleNote ? styles.sectionTitleNeutral : ""].join(" ")}>
              {section.title}
              {section.titleNote && <span className={styles.sectionTitleNote}> {section.titleNote}</span>}
            </h3>
            <div className={[styles.grid, section.columns === 3 ? styles.grid3 : ""].join(" ")}>
              {section.fields.map((field) => (
                <div key={field.key} className={field.wide ? styles.wide : undefined}>
                  <EpcrField
                    resolved={resolveField(field, incident)}
                    attention={attentionKeys.has(field.key)}
                    selected={selectedKey === field.key}
                    onSelect={() => onSelectField(field.key)}
                    onOpen={() => onOpenField(field.key)}
                    onToggleCheckbox={(checked) => onToggleCheckbox(field.key, checked)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <span className={styles.draftStatus}>{draftStatus}</span>
        <span className={styles.spacer} />
        <Button variant={props.savePrimary ? "primary" : "secondary"} onClick={onSave} style={{ height: 38 }}>
          {saveLabel}
        </Button>
      </div>
    </section>
  );
}
