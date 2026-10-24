import type { DraftNote, NoteSections, VitalsSet } from "@nightingale/schema";
import type { EpcrField, EpcrSection } from "../data/epcr";
import type { Role } from "../data/users";

// the real ePCR, laid out like the dev dashboard's form (incident, scene, patient, complaint,
// opqrst, sample, vitals, assessment, interventions, transport, bystanders, narrative), split
// per role. fire documents what it saw + did and what the medics need from it (vitals, age +
// weight, # patients, hazards, condition). paramedics chart the full clinical record in the
// order the ER nurse reads it (IMIST-AMBO)

export interface EpcrForm {
  tabs: { id: string; label: string }[];
  sections: EpcrSection[];
  /** fields the ER nurse reads first, the paramedic has to fill or confirm them */
  requiredKeys: string[];
}

const join = (v: string[] | undefined) => (v && v.length > 0 ? v.join(", ") : undefined);
const clean = (v: string | undefined | null) => (v && v.trim() ? v.trim() : null);

function vitalsLine(v: VitalsSet): string {
  return [
    v.loc && `LOC ${v.loc}`,
    v.hr && `HR ${v.hr}`,
    v.rr && `RR ${v.rr}`,
    v.bp && `BP ${v.bp}`,
    v.spo2 && `SpO2 ${v.spo2}`,
    v.gcs && `GCS ${v.gcs}`,
    v.temp && `temp ${v.temp}`,
    v.glucose && `BGL ${v.glucose}`,
    v.pain && `pain ${v.pain}`,
    v.skin && `skin ${v.skin}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** builds fields that know which note section they came from + its supporting speech */
function fieldMaker(note: DraftNote | undefined) {
  return (key: string, label: string, value: string | undefined | null, section: keyof NoteSections, opts: Partial<EpcrField> = {}): EpcrField => {
    const path = `sections.${section}`;
    return { key, label, suggested: clean(value), evidence: note?.spans.find((s) => s.field === path)?.transcriptSegmentIds ?? [], ...opts, flagPath: path };
  };
}

// words a flag note uses for a field, beyond its own label + key
const ALIASES: Record<string, string[]> = {
  "patient.name": ["named", "called", "referred to as", "identified as"],
  "patient.dob": ["birth", "dob"],
  "patient.sex": ["gender", "male", "female"],
  "patient.decisionMaker": ["consent", "decision"],
  chiefComplaint: ["laterality", "side", "left", "right", "complaint"],
};

/** red outline + reason on the field a flag is about. a flag that names no field outlines its whole section */
function applyFlags(sections: EpcrSection[], note: DraftNote | undefined): EpcrSection[] {
  const fields = sections.flatMap((s) => s.fields);
  const hits = new Map<string, string[]>();
  for (const flag of note?.flags ?? []) {
    if (!flag.ref.startsWith("sections.")) continue;
    const text = (flag.note ?? "").toLowerCase();
    const inSection = fields.filter((f) => f.flagPath === flag.ref);
    const words = (f: EpcrField) => [f.key.split(".").at(-1)!.toLowerCase(), f.label.split(/[ /(]/)[0]!.toLowerCase(), ...(ALIASES[f.key] ?? [])];
    const named = inSection.filter((f) => words(f).some((w) => w.length > 2 && text.includes(w)));
    for (const f of named.length ? named : inSection) hits.set(f.key, [...(hits.get(f.key) ?? []), flag.note ?? flag.type.replace(/_/g, " ")]);
  }
  return sections.map((s) => ({
    ...s,
    fields: s.fields.map((f) => (hits.has(f.key) ? { ...f, flagged: true, flagNote: hits.get(f.key)!.join(" · ") } : f)),
  }));
}

export function buildEpcrForm(note: DraftNote | undefined, role: Role): EpcrForm {
  const s: NoteSections = note?.sections ?? {};
  const f = fieldMaker(note);
  const t = s.incident?.times ?? {};
  const p = s.patient ?? {};
  const sa = s.sample ?? {};
  const o = s.opqrst ?? {};
  const tr = s.transport ?? {};
  const wide = { wide: true };
  const long = { wide: true, kind: "textarea" as const };

  const vitals: EpcrField[] =
    (s.vitals ?? []).length > 0
      ? (s.vitals ?? []).map((v, i) => f(`vitals.${i}`, v.time ? `Vitals at ${v.time}` : `Vitals set ${i + 1}`, vitalsLine(v), "vitals", wide))
      : [f("vitals.0", "Vitals", null, "vitals", wide)];
  const interventions: EpcrField[] = [
    ...(s.interventions ?? []).map((i, n) =>
      f(`interventions.${n}`, i.time ? `Intervention at ${i.time}` : `Intervention ${n + 1}`, [i.intervention, i.response && `response: ${i.response}`].filter(Boolean).join(", "), "interventions", wide),
    ),
    f("interventionsPerformed", "Interventions performed (summary)", s.interventionsPerformed, "interventionsPerformed", long),
  ];
  const identity: EpcrField[] = [
    f("patient.name", "Name", p.name, "patient"),
    f("patient.age", "Age", p.age, "patient"),
    f("patient.sex", "Sex", p.sex, "patient"),
    f("patient.dob", "Date of birth", p.dob, "patient"),
    f("patient.weight", "Weight", p.weight, "patient"),
  ];
  const consent: EpcrField[] = [
    f("patient.capacity", "Capacity", [p.capacity, p.capacityNote].filter(Boolean).join(": "), "patient", wide),
    f("patient.decisionMaker", "Decision maker", p.decisionMaker, "patient"),
    f("familyContact", "Family contact", s.familyContact, "familyContact"),
  ];
  const callTimes: EpcrField[] = [
    f("incident.dispatchReason", "Dispatch reason", s.incident?.dispatchReason, "incident"),
    f("incident.location", "Location", s.incident?.location, "incident"),
    f("times.callReceived", "Call received", t.callReceived, "incident"),
    f("times.onScene", "On scene", t.onScene, "incident"),
    f("times.patientContact", "Patient contact", t.patientContact, "incident"),
  ];
  const complaint = f("chiefComplaint", "Chief complaint", s.chiefComplaint, "chiefComplaint", wide);
  const mechanism = f("mechanismOrComplaint", "Mechanism / what happened", s.mechanismOrComplaint, "mechanismOrComplaint", long);
  const hazards = f("hazards", "Hazards / PPE", [s.scene?.safety, s.hazards].filter(Boolean).join(". "), "hazards", wide);
  const patients = f("scene.numberOfPatients", "# patients", s.scene?.numberOfPatients, "scene");
  const condition = f("conditionObserved", "Condition observed (LOC, ABCs)", s.conditionObserved, "conditionObserved", long);
  const exam = f("physicalExam", "Physical exam", s.physicalExam, "physicalExam", long);
  const allergies = f("sample.allergies", "Allergies", join(sa.allergies), "sample");
  const meds = f("sample.medications", "Medications", join(sa.medications) ?? join(s.medsAndAllergiesMentioned), "sample");
  const bystanders = f("bystanderStatements", "What bystanders said (review before sharing)", s.bystanderStatements, "bystanderStatements", long);
  const belongings = f("belongings", "Belongings", s.belongings, "belongings", wide);
  const handoffTo = f("transport.handoffTo", "Handed off to", tr.handoffTo, "transport");
  const narrative = f("narrative", "Narrative (AI summary of what was said and done)", s.narrative, "narrative", long);
  const timeline = f("timeline", "Timeline", s.timeline, "timeline", long);

  if (role === "firefighter") {
    return {
      tabs: [
        { id: "scene", label: "Scene" },
        { id: "patient", label: "Patient" },
        { id: "care", label: "Care" },
        { id: "handoff", label: "Handoff" },
      ],
      sections: applyFlags([
        { tab: "scene", title: "Call and times", fields: callTimes },
        {
          tab: "scene",
          title: "Scene",
          fields: [
            patients,
            f("scene.environment", "Environment", s.scene?.environment, "scene"),
            hazards,
            f("scene.othersOnScene", "Others on scene", s.scene?.othersOnScene, "scene", wide),
            f("incident.unitsOnScene", "Units on scene", s.incident?.unitsOnScene, "incident", wide),
          ],
        },
        { tab: "patient", title: "Identity", fields: identity, columns: 3 },
        { tab: "patient", title: "Capacity and consent", fields: consent },
        { tab: "patient", title: "Bystanders", fields: [bystanders] },
        { tab: "care", title: "Complaint", fields: [complaint, mechanism] },
        { tab: "care", title: "What we observed", fields: [condition, exam] },
        { tab: "care", title: "Vitals", fields: vitals },
        { tab: "care", title: "What we did", fields: interventions },
        { tab: "care", title: "Meds and allergies mentioned", fields: [allergies, meds] },
        { tab: "handoff", title: "Handoff to paramedics", fields: [handoffTo, belongings, timeline, narrative] },
      ], note),
      requiredKeys: [],
    };
  }

  return {
    tabs: [
      { id: "summary", label: "Summary" },
      { id: "patient", label: "Patient" },
      { id: "history", label: "History" },
      { id: "vitals", label: "Vitals and care" },
      { id: "transport", label: "Transport" },
    ],
    sections: applyFlags([
      { tab: "summary", title: "Incident", fields: [...callTimes, patients, hazards] },
      { tab: "summary", title: "Story", fields: [complaint, mechanism, narrative, timeline] },
      { tab: "patient", title: "Identity", fields: identity, columns: 3 },
      { tab: "patient", title: "Capacity and consent", fields: consent },
      {
        tab: "history",
        title: "OPQRST",
        columns: 3,
        fields: [
          f("opqrst.onset", "Onset", o.onset, "opqrst"),
          f("opqrst.provocation", "Provocation", o.provocation, "opqrst"),
          f("opqrst.quality", "Quality", o.quality, "opqrst"),
          f("opqrst.radiation", "Radiation", o.radiation, "opqrst"),
          f("opqrst.severity", "Severity", o.severity, "opqrst"),
          f("opqrst.time", "Time", o.time, "opqrst"),
        ],
      },
      {
        tab: "history",
        title: "SAMPLE",
        fields: [
          f("sample.signsSymptoms", "Signs / symptoms", sa.signsSymptoms, "sample", wide),
          allergies,
          meds,
          f("sample.pastHistory", "Past history", sa.pastHistory, "sample"),
          f("sample.lastOralIntake", "Last oral intake", sa.lastOralIntake, "sample"),
          f("sample.events", "Events leading up", sa.events, "sample", long),
        ],
      },
      { tab: "vitals", title: "Vitals", fields: vitals },
      { tab: "vitals", title: "Assessment", fields: [condition, exam] },
      { tab: "vitals", title: "Interventions", fields: interventions },
      {
        tab: "transport",
        title: "Transport",
        fields: [
          f("transport.destination", "Destination", tr.destination, "transport"),
          f("transport.priority", "Priority", tr.priority, "transport"),
          f("transport.position", "Position", tr.position, "transport"),
          handoffTo,
          f("times.departScene", "Departed scene", t.departScene, "incident"),
          f("times.atDestination", "At destination", t.atDestination, "incident"),
        ],
      },
      {
        tab: "transport",
        title: "From the scene",
        fields: [
          f("incident.unitsOnScene", "Units on scene", s.incident?.unitsOnScene, "incident", wide),
          f("scene.othersOnScene", "Others on scene", s.scene?.othersOnScene, "scene", wide),
          bystanders,
          belongings,
        ],
      },
    ], note),
    // IMIST-AMBO: identity, mechanism, injuries, signs, treatment, allergies, meds, background, other
    requiredKeys: ["patient.age", "patient.sex", "chiefComplaint", "mechanismOrComplaint", "vitals.0", "sample.allergies", "sample.medications", "sample.pastHistory", "transport.destination"],
  };
}
