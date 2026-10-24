import { useNavigate } from "react-router";
import { useLiveSource } from "../../api/LiveSourceContext";
import { CAPTURE_META } from "../../data/epcr";
import { PARAMEDIC_UNIT } from "../../data/users";
import { useIncident, useIncidentDispatch } from "../../incident/IncidentContext";
import { unfilledHandoffKeys } from "../../incident/selectors";
import { clockTime } from "../../lib/time";
import { useSession } from "../../session/SessionContext";
import { EpcrReviewPage } from "../epcr/EpcrReviewPage";
import { useEpcrForm } from "../epcr/useEpcrForm";

/** paramedic step 5: verify every field the ER nurse reads first, then mark Info verified */
export function ParamedicRecordPage() {
  const { user } = useSession();
  const incident = useIncident();
  const dispatch = useIncidentDispatch();
  const navigate = useNavigate();
  const live = useLiveSource();
  const form = useEpcrForm("paramedic");
  if (!user) return null;

  return (
    <EpcrReviewPage
      user={user}
      responder={PARAMEDIC_UNIT}
      title={live.source === "demo" ? CAPTURE_META.patientLabel : live.call.callId}
      meta={live.session ? `${live.call.patientLine} · fire crew's record, verify before handoff` : `Capture ended ${CAPTURE_META.captureEnded} | Imported ${CAPTURE_META.imported}`}
      tabs={form.tabs}
      sections={form.sections}
      initialTab={live.source === "demo" ? "patient" : (form.tabs[0]?.id ?? "summary")}
      showCapture={false}
      attentionKeys={new Set(unfilledHandoffKeys(incident, form))}
      saveLabel="Save changes"
      savePrimary
      onFieldChanged={(label, previous, next) =>
        dispatch({
          type: "paramedic_updated",
          update: { by: `Rick (${PARAMEDIC_UNIT})`, summary: `changed ${label}: ${previous} → ${next || "cleared"}`, at: clockTime() },
        })
      }
      onSave={() => {
        dispatch({ type: "verified", at: clockTime() });
        navigate("/paramedic");
      }}
    />
  );
}
