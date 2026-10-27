import { useLiveSource } from "../../api/LiveSourceContext";
import { sortedSessions } from "../../api/mapNote";
import type { DrillSession } from "../../api/types";
import type { RecordRow } from "../../data/incident";

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

const DEMO_ROW: RecordRow = { callId: "Sample call", unit: "Sample data, fell down stairs", callNumber: "1020382", sharedAt: "13:22", demo: true };

/** the records list: the named cases from the api plus the sample call. a fresh untitled call from the pi shows as the current call instead */
export function useRecordRows() {
  const live = useLiveSource();
  // api down or still booting = just the sample call, never the old made-up figma rows (looked real, weren't)
  const rows = [...sortedSessions(live.sessions).filter((s) => s.title).map(sessionRow), DEMO_ROW];
  return {
    rows,
    total: rows.length,
    /** points the record modal + review pages at this row's call */
    select: (row: RecordRow) => {
      if (row.demo) live.setSource("demo");
      else if (row.captureId) {
        live.setSource("api");
        live.selectSession(row.captureId);
      }
    },
    /** current call = the newest real one */
    followNewest: () => {
      if (live.source === "api") live.selectSession(null);
    },
  };
}
