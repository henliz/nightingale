import { useLiveSource } from "../../api/LiveSourceContext";
import { sortedSessions } from "../../api/mapNote";
import type { DrillSession } from "../../api/types";
import type { RecordRow } from "../../data/incident";

function sessionRow(s: DrillSession): RecordRow {
  const at = new Date(s.startedAt);
  return {
    callId: s.title ?? untitledName(s, at),
    unit: s.epcr?.sections.chiefComplaint ?? "No ePCR yet",
    callNumber: at.toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
    sharedAt: at.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false }),
    captureId: s.captureId,
  };
}

// a call from new call / a pi boot has no title, so name it after what it was
function untitledName(s: DrillSession, at: Date): string {
  const what = s.epcr?.sections.chiefComplaint ?? s.epcr?.sections.incident?.dispatchReason;
  const time = at.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
  return what ? `${what.charAt(0).toUpperCase()}${what.slice(1)} · ${time}` : `Call at ${time}`;
}

const DEMO_ROW: RecordRow = { callId: "Sample call", unit: "Sample data, fell down stairs", callNumber: "1020382", sharedAt: "13:22", demo: true };

/** the records list: every real call that has something in it (named cases + whatever got recorded since), plus the sample call */
export function useRecordRows() {
  const live = useLiveSource();
  // api down or still booting = just the sample call, never the old made-up figma rows (looked real, weren't)
  const rows = [...sortedSessions(live.sessions).filter((s) => s.title || s.assets.length > 0).map(sessionRow), DEMO_ROW];
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
