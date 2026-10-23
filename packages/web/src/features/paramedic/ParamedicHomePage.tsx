import { useState } from "react";
import { useNavigate } from "react-router";
import { recentRecordsFor, TOTAL_RECORDS } from "../../data/incident";
import { useIncident, useIncidentDispatch } from "../../incident/IncidentContext";
import { unfilledHandoffKeys } from "../../incident/selectors";
import { hasReached } from "../../incident/types";
import { clockTime } from "../../lib/time";
import { useSession } from "../../session/SessionContext";
import { CurrentCallCard } from "../home/CurrentCallCard";
import { HomeLayout } from "../home/HomeLayout";
import { PrintEpcrDialog } from "../print/PrintEpcrDialog";
import { PatientRecordModal } from "../record/PatientRecordModal";
import { RecordsList } from "../records/RecordsList";
import { ParamedicReviewCard } from "./ParamedicReviewCard";
import { QrHandoffDialog } from "./QrHandoffDialog";

/** Paramedic Steps 1, 2, 3, 4 and 6: Rick's queue, driven by the shared incident. */
export function ParamedicHomePage() {
  const { user } = useSession();
  const incident = useIncident();
  const dispatch = useIncidentDispatch();
  const navigate = useNavigate();
  const [recordOpen, setRecordOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  if (!user) return null;

  const accepted = hasReached(incident.stage, "accepted");
  const verifying = hasReached(incident.stage, "to_verify") && !hasReached(incident.stage, "verified");

  // Before verification "Open record" peeks at the record; once asked to verify it opens the full form.
  const openRecord = () => {
    if (verifying) navigate("/paramedic/record");
    else setRecordOpen(true);
  };

  return (
    <HomeLayout
      user={user}
      currentCall={<CurrentCallCard role="paramedic" incident={incident} locked={!accepted} onOpenRecord={openRecord} />}
      review={
        <ParamedicReviewCard
          incident={incident}
          unfilledCount={unfilledHandoffKeys(incident).length}
          // The prototype's Step 1 → 2 move: the fire crew shares their record.
          onReviewNote={() => dispatch({ type: "shared", at: clockTime() })}
          onAccept={() => dispatch({ type: "accepted", at: clockTime() })}
          onViewNote={() => dispatch({ type: "verify_started", at: clockTime() })}
          onRevealQr={() => {
            dispatch({ type: "qr_revealed", at: clockTime() });
            setQrOpen(true);
          }}
          onExpand={openRecord}
        />
      }
      records={(query) => (
        <RecordsList records={recentRecordsFor("paramedic")} totalCount={TOTAL_RECORDS} query={query} onView={() => setRecordOpen(true)} />
      )}
    >
      <PatientRecordModal open={recordOpen} locked={!accepted} onClose={() => setRecordOpen(false)} />
      <QrHandoffDialog
        open={qrOpen}
        version={1 + Object.keys(incident.fieldReviews).length}
        onPrint={() => setPrintOpen(true)}
        onClose={() => setQrOpen(false)}
      />
      <PrintEpcrDialog open={printOpen} onClose={() => setPrintOpen(false)} />
    </HomeLayout>
  );
}
