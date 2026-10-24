import { useState } from "react";
import { useNavigate } from "react-router";
import { recentRecordsFor, TOTAL_RECORDS } from "../../data/incident";
import { useIncident, useIncidentDispatch } from "../../incident/IncidentContext";
import { clockTime } from "../../lib/time";
import { useSession } from "../../session/SessionContext";
import { CurrentCallCard } from "../home/CurrentCallCard";
import { HomeLayout } from "../home/HomeLayout";
import { PrintEpcrDialog } from "../print/PrintEpcrDialog";
import { PatientRecordModal, type RecordTab } from "../record/PatientRecordModal";
import { RecordsList } from "../records/RecordsList";
import { ShareRecordDialog } from "../share/ShareRecordDialog";
import { FireReviewCard } from "./FireReviewCard";

/** fire steps 1, 2, 3, 5: the captain's queue, driven by the shared incident */
export function FireHomePage() {
  const { user } = useSession();
  const incident = useIncident();
  const dispatch = useIncidentDispatch();
  const navigate = useNavigate();
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordTab, setRecordTab] = useState<RecordTab>("overview");
  const [shareOpen, setShareOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  if (!user) return null;

  const openRecord = () => {
    setRecordTab("overview");
    setRecordOpen(true);
  };
  /** "Review note": transcript with the latest observation summarised on top */
  const reviewNote = () => {
    setRecordTab("transcript");
    setRecordOpen(true);
  };

  return (
    <HomeLayout
      user={user}
      currentCall={
        <CurrentCallCard
          role="firefighter"
          incident={incident}
          onOpenRecord={openRecord}
          onShare={() => setShareOpen(true)}
          onPrint={() => setPrintOpen(true)}
          onSeeChanges={openRecord}
        />
      }
      review={
        <FireReviewCard
          incident={incident}
          onCrewEnRoute={() => dispatch({ type: "crew_en_route", at: clockTime(), now: Date.now() })}
          onStartReview={() => {
            dispatch({ type: "review_started", at: clockTime() });
            reviewNote();
          }}
          onPeekRecord={reviewNote}
          onFinishReview={() => navigate("/fire/record")}
          onExpand={openRecord}
        />
      }
      records={(query) => <RecordsList records={recentRecordsFor("firefighter")} totalCount={TOTAL_RECORDS} query={query} onView={openRecord} />}
    >
      <PatientRecordModal open={recordOpen} initialTab={recordTab} onClose={() => setRecordOpen(false)} />
      <PrintEpcrDialog open={printOpen} onClose={() => setPrintOpen(false)} />
      <ShareRecordDialog open={shareOpen} onShared={() => dispatch({ type: "shared", at: clockTime() })} onClose={() => setShareOpen(false)} />
    </HomeLayout>
  );
}
