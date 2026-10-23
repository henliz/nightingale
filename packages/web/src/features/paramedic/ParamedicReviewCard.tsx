import { Button } from "../../components/ui/Button/Button";
import { Card } from "../../components/ui/Card/Card";
import { PARAMEDIC_OBSERVATION } from "../../data/incident";
import { hasReached, type IncidentState } from "../../incident/types";
import { ReviewExcerpt, ReviewHead } from "../home/ReviewCardParts";
import styles from "../home/ReviewCard.module.css";

interface ParamedicReviewCardProps {
  incident: IncidentState;
  unfilledCount: number;
  onReviewNote: () => void;
  onAccept: () => void;
  onViewNote: () => void;
  onRevealQr: () => void;
  onExpand: () => void;
}

/** "Needs your review" for the paramedic crew, by story step. */
export function ParamedicReviewCard(props: ParamedicReviewCardProps) {
  const { incident, unfilledCount, onReviewNote, onAccept, onViewNote, onRevealQr, onExpand } = props;
  const { stage } = incident;

  if (!hasReached(stage, "shared")) {
    const o = PARAMEDIC_OBSERVATION.fromCall;
    return (
      <Card className={styles.card}>
        <ReviewHead title="View the latest observation" onExpand={onExpand}>{`Received ${o.receivedAt} | Not yet reviewed`}</ReviewHead>
        <ReviewExcerpt text={o.text} hint="Review before adding to the record." />
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onReviewNote}>
            Review note
          </Button>
        </div>
      </Card>
    );
  }

  if (stage === "shared") {
    return (
      <Card className={styles.card}>
        <ReviewHead title="Accept record to view" onExpand={onExpand}>{`Shared ${incident.times.shared ?? ""} | Not yet accepted`}</ReviewHead>
        <ReviewExcerpt text="Patient 007 ePCR" />
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onAccept}>
            Accept record
          </Button>
        </div>
      </Card>
    );
  }

  if (stage === "accepted") {
    const o = PARAMEDIC_OBSERVATION.fromFire;
    return (
      <Card className={styles.card}>
        <ReviewHead title="View the latest observation" onExpand={onExpand}>{`Received ${incident.times.accepted ?? o.receivedAt} | Not yet reviewed`}</ReviewHead>
        <ReviewExcerpt text={o.text} hint="Review before adding to the care timeline." />
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onViewNote}>
            View note
          </Button>
        </div>
      </Card>
    );
  }

  if (stage === "to_verify") {
    return (
      <Card className={styles.card}>
        <ReviewHead title="Review and verify the patient’s record" onExpand={onExpand}>{`Shared ${incident.times.shared ?? ""} | Not yet reviewed`}</ReviewHead>
        <div className={styles.warning} role="status">
          <span aria-hidden="true">⚠</span>
          {unfilledCount} field{unfilledCount === 1 ? " has" : "s have"} not been filled
        </div>
      </Card>
    );
  }

  const revealed = incident.qrRevealedAt;
  return (
    <Card className={styles.card}>
      <ReviewHead title="Patient record QR code" onExpand={onExpand}>
        {`Generated ${incident.times.verified ?? ""} | ${revealed ? `Revealed ${revealed}` : "Not revealed yet"}`}
      </ReviewHead>
      <div className={styles.qrBox}>
        <button type="button" className={styles.qrButton} onClick={onRevealQr}>
          {revealed ? "Show QR code" : "Reveal QR code"}
        </button>
      </div>
    </Card>
  );
}
