import { useState } from "react";
import { useNavigate } from "react-router";
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
import { useRecordRows } from "../records/useRecordRows";
import { useEpcrForm } from "../epcr/useEpcrForm";
import { ParamedicReviewCard } from "./ParamedicReviewCard";
import { QrHandoffDialog } from "./QrHandoffDialog";

/** paramedic steps 1, 2, 3, 4, 6: Rick's queue, driven by the shared incident */
export function ParamedicHomePage() {
  const { user } = useSession();
  const incident = useIncident();
  const dispatch = useIncidentDispatch();
  const navigate = useNavigate();
  const [recordOpen, setRecordOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const records = useRecordRows();
  const form = useEpcrForm("paramedic");
  if (!user) return null;

  const accepted = hasReached(incident.stage, "accepted");
  const verifying = hasReached(incident.stage, "to_verify") && !hasReached(incident.stage, "verified");

  // before verify, "Open record" just peeks. once asked to verify it opens the full form
  const openRecord = () => {
    if (verifying) navigate("/paramedic/record");
    else setRecordOpen(true);
  };

  return (
    <HomeLayout
      user={user}
      currentCall={
        <CurrentCallCard
          role="paramedic"
          incident={incident}
          locked={!accepted}
          onOpenRecord={() => {
            records.followNewest();
            openRecord();
          }}
        />
      }
      review={
        <ParamedicReviewCard
          incident={incident}
          unfilledCount={unfilledHandoffKeys(incident, form).length}
          // prototype's step 1 → 2: fire crew shares their record
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
        <RecordsList
          records={records.rows}
          totalCount={records.total}
          query={query}
          onView={(row) => {
            records.select(row);
            setRecordOpen(true);
          }}
        />
      )}
    >
      <PatientRecordModal open={recordOpen} locked={!accepted} onClose={() => setRecordOpen(false)} />
      <QrHandoffDialog
        open={qrOpen}
        version={1 + Object.keys(incident.fieldReviews).length}
        onPrint={() => setPrintOpen(true)}
        onClose={() => setQrOpen(false)}
      />
      <PrintEpcrDialog role="paramedic" open={printOpen} onClose={() => setPrintOpen(false)} />
    </HomeLayout>
  );
}
