import { useNavigate } from "react-router";
import { useLiveSource } from "../../api/LiveSourceContext";
import { CAPTURE_META } from "../../data/epcr";
import { useIncidentDispatch } from "../../incident/IncidentContext";
import { clockTime } from "../../lib/time";
import { useSession } from "../../session/SessionContext";
import { EpcrReviewPage } from "../epcr/EpcrReviewPage";
import { useEpcrForm } from "../epcr/useEpcrForm";

/** fire step 4: captain checks every field before anything leaves the device */
export function FireRecordPage() {
  const { user } = useSession();
  const dispatch = useIncidentDispatch();
  const navigate = useNavigate();
  const live = useLiveSource();
  const form = useEpcrForm("firefighter");
  if (!user) return null;

  const meta = live.session
    ? `${live.call.patientLine} · ${live.session.assets.length} chunks · ePCR ${live.session.epcrStatus ?? "pending"}`
    : `Capture ended ${CAPTURE_META.captureEnded} | Imported ${CAPTURE_META.imported}`;

  return (
    <EpcrReviewPage
      user={user}
      responder="FF-12"
      title={live.source === "demo" ? CAPTURE_META.patientLabel : live.call.callId}
      meta={meta}
      tabs={form.tabs}
      sections={form.sections}
      excerpts={live.excerpts ?? undefined}
      captureSummary={live.session ? `${live.excerpts?.flatMap((e) => e.turns).length ?? 0} lines, ${live.session.speakers?.length ?? 0} voices heard` : undefined}
      initialTab={form.tabs[0]?.id ?? "patient"}
      saveLabel="Save changes"
      onSave={() => {
        dispatch({ type: "review_saved", at: clockTime() });
        navigate("/fire");
      }}
    />
  );
}
