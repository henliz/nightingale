import { Button } from "../../components/ui/Button/Button";
import { Card } from "../../components/ui/Card/Card";
import { CURRENT_CALL, LATEST_OBSERVATION } from "../../data/incident";
import type { IncidentState } from "../../incident/types";
import { ReviewExcerpt, ReviewHead } from "../home/ReviewCardParts";
import styles from "../home/ReviewCard.module.css";

interface FireReviewCardProps {
  incident: IncidentState;
  onCrewEnRoute: () => void;
  /** Step 2: takes the captain into the review (Step 3). */
  onStartReview: () => void;
  /** Step 3: peeks at the record without leaving the queue. */
  onPeekRecord: () => void;
  onFinishReview: () => void;
  onExpand: () => void;
}

/** "Needs your review" for the fire captain, by story step. */
export function FireReviewCard({ incident, onCrewEnRoute, onStartReview, onPeekRecord, onFinishReview, onExpand }: FireReviewCardProps) {
  const { stage } = incident;

  if (stage === "dispatched") {
    return (
      <Card className={styles.card}>
        <ReviewHead title="Incident created from dispatch" onExpand={onExpand}>
          {`Created ${CURRENT_CALL.dispatch.createdAt} by dispatch  |  Nothing captured yet`}
        </ReviewHead>
        <ReviewExcerpt text={CURRENT_CALL.dispatch.text} hint="Updates on its own as the crew captures information on scene." />
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCrewEnRoute}>
            Crew en route
          </Button>
        </div>
      </Card>
    );
  }

  if (stage === "on_scene" || stage === "needs_review") {
    const observation = LATEST_OBSERVATION[stage];
    return (
      <Card className={styles.card}>
        <ReviewHead title="Review the latest observation" onExpand={onExpand}>
          {`Received ${observation.receivedAt} | Not yet reviewed`}
        </ReviewHead>
        <ReviewExcerpt text={observation.text} hint="Review before adding to the record." />
        <div className={styles.actions}>
          <Button variant="secondary" onClick={stage === "on_scene" ? onStartReview : onPeekRecord}>
            Review note
          </Button>
          {stage === "needs_review" && <Button onClick={onFinishReview}>Finish review</Button>}
        </div>
      </Card>
    );
  }

  return (
    <Card className={styles.card}>
      <ReviewHead title="Review the latest observation" onExpand={onExpand} />
      <ReviewExcerpt text="All caught up!" />
    </Card>
  );
}
