import { useNavigate } from "react-router";
import { useLiveSource } from "../../api/LiveSourceContext";
import { applyOverrides, CAPTURE_META, EPCR_SECTIONS, EPCR_TABS } from "../../data/epcr";
import { useIncidentDispatch } from "../../incident/IncidentContext";
import { clockTime } from "../../lib/time";
import { useSession } from "../../session/SessionContext";
import { EpcrReviewPage } from "../epcr/EpcrReviewPage";

/** Fire Step 4: the captain checks every field before anything leaves the device. */
export function FireRecordPage() {
  const { user } = useSession();
  const dispatch = useIncidentDispatch();
  const navigate = useNavigate();
  const live = useLiveSource();
  if (!user) return null;

  const sections = live.epcr ? applyOverrides(EPCR_SECTIONS, live.epcr) : EPCR_SECTIONS;
  const title = live.session?.title ?? (live.session ? `Capture ${live.session.captureId}` : CAPTURE_META.patientLabel);
  const meta = live.session
    ? `${live.session.assets.length} chunks · ePCR ${live.session.epcrStatus ?? "pending"} · live from the api`
    : `Capture ended ${CAPTURE_META.captureEnded} | Imported ${CAPTURE_META.imported}`;

  return (
    <EpcrReviewPage
      user={user}
      responder="FF-12"
      title={title}
      meta={meta}
      tabs={EPCR_TABS}
      sections={sections}
      excerpts={live.excerpts ?? undefined}
      captureSummary={live.session ? `${live.excerpts?.flatMap((e) => e.turns).length ?? 0} lines, ${live.session.speakers?.length ?? 0} voices heard` : undefined}
      initialTab="patient"
      saveLabel="Save changes"
      onSave={() => {
        dispatch({ type: "review_saved", at: clockTime() });
        navigate("/fire");
      }}
    />
  );
}
