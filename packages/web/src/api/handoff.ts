import { NOT_CAPTURED, type EpcrSection } from "../data/epcr";
import type { HandoffRow } from "../data/handoff";
import { resolveField } from "../incident/selectors";
import type { IncidentState } from "../incident/types";
import { UNNAMED } from "./call";

export interface HandoffSummary {
  rows: HandoffRow[];
  lockedIdentity: string;
  unlockedIdentity: string;
}

/** the triage nurse's page in IMIST-AMBO order, from the paramedic's verified form (reviews applied) */
export function handoffSummary(sections: readonly EpcrSection[], state: IncidentState): HandoffSummary {
  const fields = sections.flatMap((s) => s.fields);
  const value = (key: string) => {
    const field = fields.find((f) => f.key === key);
    const v = field ? resolveField(field, state).value : "";
    return v && v !== NOT_CAPTURED ? v : undefined;
  };
  const all = (prefix: string) => fields.filter((f) => f.key.startsWith(prefix)).map((f) => value(f.key)).filter(Boolean);
  const line = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(". ") || NOT_CAPTURED;

  const name = value("patient.name") ?? UNNAMED;
  const ageSex = [value("patient.age"), value("patient.sex")].filter(Boolean).join(", ");
  const vitals = all("vitals.");
  return {
    rows: [
      { label: "Identification", text: line([name, ageSex].filter(Boolean).join(", "), value("familyContact") && `Family: ${value("familyContact")}`), identity: true },
      { label: "Mechanism", text: line(value("mechanismOrComplaint")) },
      { label: "Injuries", text: line(value("chiefComplaint"), value("physicalExam")) },
      { label: "Signs", text: line(vitals.at(-1), value("conditionObserved")) },
      { label: "Treatment", text: line(all("interventions.").join("; "), value("interventionsPerformed")) },
      { label: "Allergies", text: line(value("sample.allergies")) },
      { label: "Medications", text: line(value("sample.medications")) },
      { label: "Background", text: line(value("sample.pastHistory")) },
      { label: "Other", text: line(value("patient.capacity") && `Capacity: ${value("patient.capacity")}`, value("patient.decisionMaker") && `Decision maker: ${value("patient.decisionMaker")}`, value("belongings") && `Belongings: ${value("belongings")}`) },
    ],
    lockedIdentity: `Locked until receipt is confirmed. ${ageSex || "Age and sex not captured"}.`,
    unlockedIdentity: [name, ageSex].filter(Boolean).join(", "),
  };
}
