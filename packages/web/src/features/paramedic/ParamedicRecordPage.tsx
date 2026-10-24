import { useNavigate } from "react-router";
import { useLiveSource } from "../../api/LiveSourceContext";
import { applyOverrides, CAPTURE_META, EPCR_SECTIONS, EPCR_TABS } from "../../data/epcr";
import { useIncident, useIncidentDispatch } from "../../incident/IncidentContext";
import { unfilledHandoffKeys } from "../../incident/selectors";
import { clockTime } from "../../lib/time";
import { useSession } from "../../session/SessionContext";
import { EpcrReviewPage } from "../epcr/EpcrReviewPage";

/** paramedic step 5: verify every field the ER nurse reads first, then mark Info verified */
export function ParamedicRecordPage() {
  const { user } = useSession();
  const incident = useIncident();
  const dispatch = useIncidentDispatch();
  const navigate = useNavigate();
  const live = useLiveSource();
  if (!user) return null;

  const sections = live.epcr ? applyOverrides(EPCR_SECTIONS, live.epcr) : EPCR_SECTIONS;

  return (
    <EpcrReviewPage
      user={user}
      responder="Unit 4471"
      title={live.session?.title ?? CAPTURE_META.patientLabel}
      meta={live.session ? "Fire crew's record · live from the api" : `Capture ended ${CAPTURE_META.captureEnded} | Imported ${CAPTURE_META.imported}`}
      tabs={EPCR_TABS}
      sections={sections}
      initialTab="patient"
      showCapture={false}
      attentionKeys={new Set(unfilledHandoffKeys(incident))}
      saveLabel="Save changes"
      savePrimary
      onFieldChanged={(label, previous, next) =>
        dispatch({
          type: "paramedic_updated",
          update: { by: "Rick (Unit 4471)", summary: `changed ${label}: ${previous} → ${next || "cleared"}`, at: clockTime() },
        })
      }
      onSave={() => {
        dispatch({ type: "verified", at: clockTime() });
        navigate("/paramedic");
      }}
    />
  );
}
