import { HazardStrip } from "../../components/clinical/HazardStrip";
import { Alert } from "../../components/ui/Alert/Alert";
import { Button } from "../../components/ui/Button/Button";
import { Card } from "../../components/ui/Card/Card";
import { Chip } from "../../components/ui/Chip/Chip";
import { Icon } from "../../components/ui/Icon/Icon";
import { useLiveSource } from "../../api/LiveSourceContext";
import { sortedSessions } from "../../api/mapNote";
import { PARAMEDIC_UNIT, type Role } from "../../data/users";
import { hasReached, type IncidentState } from "../../incident/types";
import { elapsed } from "../../lib/time";
import { useNow } from "../../lib/useNow";
import { PROGRESS_STEPS } from "./progressSteps";
import { StageProgress } from "./StageProgress";
import styles from "./CurrentCallCard.module.css";

interface CurrentCallCardProps {
  role: Role;
  incident: IncidentState;
  /** paramedic side before accepting, record opens as a locked summary */
  locked?: boolean;
  onOpenRecord: () => void;
  onShare?: () => void;
  onPrint?: () => void;
  onSeeChanges?: () => void;
}

function FireDeviceChip({ incident }: { incident: IncidentState }) {
  const live = useLiveSource();
  // the newest real call is the one the pi is saving into, so its chip shows the actual device
  const isLiveCall = live.source === "api" && live.session !== null && sortedSessions(live.sessions)[0]?.captureId === live.session.captureId;
  const recording = incident.recordingStartedAt !== null;
  const now = useNow(isLiveCall || recording);
  if (isLiveCall) {
    const on = live.device !== null && now - live.device.lastHeard < 45_000;
    return on ? <Chip tone="active">Nightingale on</Chip> : <Chip>Nightingale off</Chip>;
  }
  if (incident.stage === "dispatched") return <Chip>NEW</Chip>;
  if (recording && incident.recordingStartedAt !== null) {
    return <Chip tone="active">Nightingale active {elapsed(incident.recordingStartedAt, now)}</Chip>;
  }
  return <Chip>Nightingale inactive</Chip>;
}

// closing the loop: crews want proof it arrived (p81), so the furthest receipt sits on the card
function ReceiptChip({ incident }: { incident: IncidentState }) {
  if (hasReached(incident.stage, "received")) return <Chip tone="active">✓ Received by triage {incident.times.received ?? ""}</Chip>;
  if (hasReached(incident.stage, "accepted")) return <Chip tone="active">✓ Accepted by {PARAMEDIC_UNIT}</Chip>;
  if (hasReached(incident.stage, "shared")) return <Chip tone="warning">Shared · not opened yet</Chip>;
  return null;
}

export function CurrentCallCard({ role, incident, locked = false, onOpenRecord, onShare, onPrint, onSeeChanges }: CurrentCallCardProps) {
  const isFire = role === "firefighter";
  const reviewed = hasReached(incident.stage, "reviewed");
  const shared = hasReached(incident.stage, "shared");
  const accepted = hasReached(incident.stage, "accepted");
  const showExpand = isFire ? !reviewed : true;
  const { call } = useLiveSource();

  return (
    <Card aria-labelledby="current-call-title">
      <div className={styles.identity}>
        <span className={styles.callId}>{call.callId}</span>
        {isFire ? <FireDeviceChip incident={incident} /> : !shared && <Chip>NEW</Chip>}
        {isFire && reviewed && onShare && (
          <Button variant="small" onClick={onShare}>
            <Icon name="link" width={12} height={10} />
            Share link
          </Button>
        )}
        <ReceiptChip incident={incident} />
        {call.conflicts > 0 && (
          <span className={styles.conflicts}>
            {call.conflicts} conflict{call.conflicts === 1 ? "" : "s"} to check
          </span>
        )}
        <span className={styles.spacer} />
        {showExpand && (
          <button type="button" className={styles.iconButton} onClick={onOpenRecord} aria-label="Expand record">
            <Icon name="arrowsOut" size={18} />
          </button>
        )}
      </div>

      <h2 id="current-call-title" className={styles.title}>
        {call.headline}
      </h2>
      {/* option A: one quiet meta line, line icons, scene safety leads in green */}
      <p className={styles.meta}>
        <HazardStrip hazards={call.hazards} inline />
        <span className={styles.metaItem}>
          <ClockGlyph />
          {call.firstContact ? `First contact ${call.firstContact}` : "No first contact yet"}
        </span>
        <span className={styles.metaItem}>
          <PersonGlyph />
          {/* the call data separates with "|" and double spaces; one separator reads cleaner */}
          {call.patientLine.split(/\s*\|\s*|\s{2,}/).filter(Boolean).join(" · ")}
        </span>
      </p>

      {isFire && shared && (
        <div className={styles.banners}>
          {accepted ? (
            <Alert
              tone="success"
              title={`Shared with ${PARAMEDIC_UNIT}  ·  Accepted`}
              body={`Accepted ${incident.times.accepted ?? ""}. The paramedic crew confirmed receipt and identity is unlocked on their side.`}
            />
          ) : (
            <Alert
              tone="warning"
              title={`Shared with ${PARAMEDIC_UNIT}  ·  delivered, not yet opened`}
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
          {locked && <Icon name="lock" size={14} className={styles.lockIcon} />}
          {locked ? "Open summary" : "Open record"}
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

function ClockGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.8V8l2.2 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PersonGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.4" r="2.7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.9 13.6c.6-2.6 2.6-4.1 5.1-4.1s4.5 1.5 5.1 4.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
