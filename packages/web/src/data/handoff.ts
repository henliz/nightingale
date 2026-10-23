/** The hospital handoff summary in IMIST-AMBO order. Fictional drill data. */
export const HANDOFF_TOKEN = "7Q4K-29XZ";

/** The secure link encoded in the QR code; opens on this same origin. */
export function handoffUrl(): string {
  return `${window.location.origin}/handoff/${HANDOFF_TOKEN}`;
}

export interface HandoffRow {
  label: string;
  text: string;
  /** Hidden until the triage nurse confirms receipt. */
  identity?: boolean;
}

export const HANDOFF_ROWS: readonly HandoffRow[] = [
  { label: "Identification", text: "Eleanor Walsh, 81 F. Health card photographed on scene. Daughter Maria, 519-555-0142, en route.", identity: true },
  { label: "Mechanism", text: "Fall down approx. 8 interior stairs at home, 13:10. Found by neighbour. No loss of consciousness reported." },
  { label: "Injuries", text: "Left hip pain on movement, shortening and external rotation. Small laceration right forehead, bleeding controlled." },
  { label: "Signs", text: "GCS 14 (confused). HR 96, BP 148/88, RR 18, SpO2 95% RA, 14:30. Status: responds to voice only, 14:38." },
  { label: "Treatment", text: "Spinal precautions. Left leg splinted. Oxygen 4 L by nasal cannula, 14:38. No analgesia given." },
  { label: "Allergies", text: 'Penicillin (corrected by Capt. Alvin from "none known", 14:36).' },
  { label: "Medications", text: "Apixaban, metoprolol, metformin. Photo of medication list attached. Anticoagulant: yes." },
  { label: "Background", text: "AFib, type 2 diabetes, hypertension. Lives alone. Mobile with cane." },
  { label: "Other", text: "Belongings: cane, purse with health card. Paper On scene sheet travels with patient. Who said what and when is logged on every field." },
];

export const HANDOFF_LOCKED_IDENTITY = "Locked until receipt is confirmed. Age 81, female, from residence.";
export const HANDOFF_HAZARDS = "Scene safety and hazards: none flagged. No violence, no weapons, no infectious-risk note.";
export const HANDOFF_FOOTNOTE =
  "Read-only. Opens from the QR code or printed Letter page. Every open is logged to the record. Hospitals keep their own EMR; nothing here is written into Epic, Cerner or PowerChart.";
export const HANDOFF_IDENTITY_UNLOCKED = "Eleanor Walsh, F, 81";
