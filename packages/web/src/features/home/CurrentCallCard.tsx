import { Alert } from "../../components/ui/Alert/Alert";
import { Button } from "../../components/ui/Button/Button";
import { Card } from "../../components/ui/Card/Card";
import { Chip } from "../../components/ui/Chip/Chip";
import { Icon } from "../../components/ui/Icon/Icon";
import { CURRENT_CALL } from "../../data/incident";
import type { Role } from "../../data/users";
import { hasReached, type IncidentState } from "../../incident/types";
import { elapsed } from "../../lib/time";
import { useNow } from "../../lib/useNow";
import { PROGRESS_STEPS } from "./progressSteps";
import { StageProgress } from "./StageProgress";
import styles from "./CurrentCallCard.module.css";

interface CurrentCallCardProps {
  role: Role;
  incident: IncidentState;
  /** Paramedic side before acceptance: the record opens as a locked summary. */
  locked?: boolean;
  onOpenRecord: () => void;
  onShare?: () => void;
  onPrint?: () => void;
  onSeeChanges?: () => void;
}

function FireDeviceChip({ incident }: { incident: IncidentState }) {
  const recording = incident.recordingStartedAt !== null;
  const now = useNow(recording);
  if (incident.stage === "dispatched") return <Chip>NEW</Chip>;
  if (recording && incident.recordingStartedAt !== null) {
    return <Chip tone="active">Nightingale active {elapsed(incident.recordingStartedAt, now)}</Chip>;
  }
  return <Chip>Nightingale inactive</Chip>;
}

export function CurrentCallCard({ role, incident, locked = false, onOpenRecord, onShare, onPrint, onSeeChanges }: CurrentCallCardProps) {
  const isFire = role === "firefighter";
  const reviewed = hasReached(incident.stage, "reviewed");
  const shared = hasReached(incident.stage, "shared");
  const accepted = hasReached(incident.stage, "accepted");
  const showExpand = isFire ? !reviewed : true;

  return (
    <Card aria-labelledby="current-call-title">
      <div className={styles.identity}>
        <span className={styles.callId}>CALL ID: {CURRENT_CALL.callId}</span>
        {isFire ? <FireDeviceChip incident={incident} /> : !shared && <Chip>NEW</Chip>}
        {isFire && reviewed && onShare && (
          <Button variant="small" onClick={onShare}>
            <Icon name="link" width={12} height={10} />
            Share link
          </Button>
        )}
        <span className={styles.spacer} />
        <span className={styles.firstContact}>First contact {CURRENT_CALL.firstContact}</span>
        {showExpand && (
          <button type="button" className={styles.iconButton} onClick={onOpenRecord} aria-label="Expand record">
            <Icon name="arrowsOut" size={22} />
          </button>
        )}
      </div>

      <h2 id="current-call-title" className={styles.title}>
        {CURRENT_CALL.title}
      </h2>
      <p className={styles.patient}>{CURRENT_CALL.patientLineByRole[role]}</p>

      {isFire && shared && (
        <div className={styles.banners}>
          {accepted ? (
            <Alert
              tone="success"
              title={`Shared with ${CURRENT_CALL.paramedicUnit}  ·  Accepted`}
              body={`Accepted ${incident.times.accepted ?? ""}. The paramedic crew confirmed receipt and identity is unlocked on their side.`}
            />
          ) : (
            <Alert
              tone="warning"
              title={`Shared with ${CURRENT_CALL.paramedicUnit}  ·  delivered, not yet opened`}
              body={`Sent ${incident.times.shared ?? ""}. You will see this change to Accepted when the paramedic crew confirms receipt. Identity stays locked until then.`}
            />
          )}
          {incident.lastParamedicUpdate && onSeeChanges && (
            <Alert
              tone="info"
              title="Paramedics updated this record"
              body={`${incident.lastParamedicUpdate.by} ${incident.lastParamedicUpdate.summary}, ${incident.lastParamedicUpdate.at}. Your copy has refreshed.`}
              action={{ label: "See what changed", onClick: onSeeChanges }}
            />
          )}
        </div>
      )}

      <StageProgress steps={PROGRESS_STEPS[role]} incident={incident} />

      <div className={styles.actions}>
        <Button variant={locked ? "primarySoft" : "primary"} onClick={onOpenRecord}>
          Open record
        </Button>
        {isFire && reviewed && onPrint && (
          <Button variant="outline" onClick={onPrint}>
            Print Report
          </Button>
        )}
      </div>
    </Card>
  );
}
