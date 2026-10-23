import type { EpcrField } from "../../data/epcr";
import { EPCR_FIELD_BY_KEY } from "../../data/epcr";
import { resolveField } from "../../incident/selectors";
import type { IncidentState } from "../../incident/types";

export interface PrintCell {
  label?: string;
  value: string;
}

export interface PrintRow {
  cells: PrintCell[];
  height?: number;
}

export interface PrintBlock {
  heading: string;
  rows: PrintRow[];
}

const NOT_CAPTURED = "Not captured";

function valueOf(key: string, state: IncidentState): string {
  const field: EpcrField | undefined = EPCR_FIELD_BY_KEY.get(key);
  if (!field) return NOT_CAPTURED;
  const v = resolveField(field, state).value;
  return v || NOT_CAPTURED;
}

/** The Letter page, in the Woolwich Fire sheet order. Left column: patient; right: service. */
export function buildPrintLayout(state: IncidentState): { left: PrintBlock[]; right: PrintBlock[]; bottom: PrintBlock[] } {
  const v = (key: string) => valueOf(key, state);
  const cell = (label: string, key: string): PrintCell => ({ label, value: v(key) });
  const empty = (label: string): PrintCell => ({ label, value: NOT_CAPTURED });

  return {
    left: [
      {
        heading: "Patient",
        rows: [
          { cells: [cell("Surname", "surname"), cell("Initial", "initial"), cell("First Name", "firstName")] },
          { cells: [cell("Mailing Address", "mailingAddress")] },
          { cells: [cell("City / Town", "city"), cell("Country", "country")] },
          { cells: [cell("Province", "province"), cell("Postal Code", "postalCode")] },
          { cells: [cell("Hospital Registration Num.", "hospitalRegistration"), cell("Date of Birth", "dob")] },
          { cells: [cell("Health Card Number", "healthCard"), cell("Version", "version")] },
          { cells: [cell("Special Codes", "specialCodes"), { label: "S.A.M.", value: v("sam") === "yes" ? "Yes" : NOT_CAPTURED }] },
        ],
      },
      {
        heading: "Locations",
        rows: [
          { cells: [cell("Pick-up Location", "occurrenceLocation")] },
          { cells: [cell("Pick-up City / Town", "city")] },
          { cells: [empty("Relay Location")] },
        ],
      },
    ],
    right: [
      {
        heading: "Service and call",
        rows: [
          { cells: [{ label: "Service Name", value: "Woolwich Township Fire" }] },
          { cells: [empty("CACC"), cell("Call Number / Patient Number", "callNumber")], height: 40 },
          { cells: [empty("Call Date"), { label: "Call Type", value: "Medical assist" }, { label: "Crew Type", value: "Fire first response" }] },
          { cells: [cell("Vehicle Num.", "unit"), { label: "Station", value: "Station 2" }, empty("Vehicle Status")] },
          { cells: [empty("UTM Code"), empty("Flight #"), { label: "Patients", value: "1" }, empty("Sequence")] },
          { cells: [empty("Dispatch Prb. Code"), empty("Dispatch"), empty("Return")] },
          { cells: [empty("Start (Km)"), empty("PU (Km)"), empty("Dest. (Km)")] },
          { cells: [empty("To Scene Warning Systems"), empty("To Destination Warning Systems")], height: 40 },
          { cells: [empty("Sending Hospital"), empty("Landing Site")] },
          { cells: [empty("In Hospital Location"), empty("Pick-up Code")] },
        ],
      },
    ],
    bottom: [
      {
        heading: "Clinical Information",
        rows: [
          { cells: [cell("Chief Complaint", "chiefComplaint"), cell("Time of Occurrence", "timeOfOccurrence")], height: 34 },
          { cells: [cell("Primary Problem", "painLocation"), empty("Secondary Problem")] },
        ],
      },
      {
        heading: "Incident History",
        rows: [
          { cells: [{ value: v("incidentHistory") }], height: 72 },
          { cells: [{ label: "Relevant Past Hx Provided By", value: "Daughter" }, cell("Relevant Past Hx", "pastHistory")], height: 40 },
        ],
      },
      {
        heading: "Observations",
        rows: [{ cells: [cell("Pulse", "pulse"), cell("Resp", "resp"), cell("B/P", "bp"), cell("LOC", "levelOfConsciousness")] }],
      },
      {
        heading: "Medications and allergies",
        rows: [{ cells: [cell("Medications", "medications"), cell("Allergies", "allergies")], height: 34 }],
      },
      {
        heading: "Care and response",
        rows: [{ cells: [{ value: v("careAndResponse") }], height: 48 }],
      },
    ],
  };
}
