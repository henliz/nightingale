import { useLiveSource } from "../../api/LiveSourceContext";
import { sortedSessions } from "../../api/mapNote";
import type { DrillSession } from "../../api/types";
import { recentRecordsFor, TOTAL_RECORDS, type RecordRow } from "../../data/incident";
import type { Role } from "../../data/users";

function sessionRow(s: DrillSession): RecordRow {
  const at = new Date(s.startedAt);
  return {
    callId: s.title ?? `Call ${at.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`,
    unit: s.epcr?.sections.chiefComplaint ?? "No ePCR yet",
    callNumber: at.toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
    sharedAt: at.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false }),
    captureId: s.captureId,
  };
}

const DEMO_ROW: RecordRow = { callId: "Demo case", unit: "Sample data, fell down stairs", callNumber: "1020382", sharedAt: "13:22", demo: true };

/** the records list: the saved calls from the api (plus the demo case), or the fixture rows in demo mode */
export function useRecordRows(role: Role) {
  const live = useLiveSource();
  const rows = live.source === "api" && live.status === "ready" ? [...sortedSessions(live.sessions).map(sessionRow), DEMO_ROW] : recentRecordsFor(role);
  return {
    rows,
    total: live.source === "api" && live.status === "ready" ? rows.length : TOTAL_RECORDS,
    /** points the record modal + review pages at this row's call */
    select: (row: RecordRow) => {
      if (row.demo) live.setSource("demo");
      else if (row.captureId) live.selectSession(row.captureId);
    },
    /** current call = the newest one, so opening it stops pinning an older record */
    followNewest: () => live.selectSession(null),
  };
}
