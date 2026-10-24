import { useState } from "react";
import { Button } from "../../components/ui/Button/Button";
import { Dialog } from "../../components/ui/Dialog/Dialog";
import { Icon } from "../../components/ui/Icon/Icon";
import { Tabs } from "../../components/ui/Tabs/Tabs";
import { useLiveSource } from "../../api/LiveSourceContext";
import { buildRecord, fileKey, PATIENT } from "../../data/record";
import { useIncident, useIncidentDispatch } from "../../incident/IncidentContext";
import { clockTime, elapsed } from "../../lib/time";
import { useNow } from "../../lib/useNow";
import { useSession } from "../../session/SessionContext";
import { FilesView } from "./views/FilesView";
import { IncidentView } from "./views/IncidentView";
import { NoteFormView } from "./views/NoteFormView";
import { OverviewView } from "./views/OverviewView";
import { TimelineView } from "./views/TimelineView";
import { TranscriptView } from "./views/TranscriptView";
import { UploadView } from "./views/UploadView";
import { LockedSummaryView } from "./views/LockedSummaryView";
import styles from "./PatientRecordModal.module.css";

type Tab = "overview" | "transcript" | "timeline" | "files" | "incident";

function LockedSummary({ tab }: { tab: Tab }) {
  return <LockedSummaryView showSummary={tab === "overview"} />;
}
type SubView = "noteform" | "upload" | null;

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "transcript", label: "Transcript" },
  { id: "timeline", label: "Care timeline" },
  { id: "files", label: "Files" },
  { id: "incident", label: "Incident" },
] as const satisfies readonly { id: Tab; label: string }[];

interface PatientRecordModalProps {
  open: boolean;
  /** tab to open on, "Review note" opens the transcript */
  initialTab?: Tab;
  /** paramedic step 2: shared, not accepted yet. hazards show, identity stays locked */
  locked?: boolean;
  onClose: () => void;
}

/** overlays A + B: the patient record, read from the shared incident */
export type RecordTab = Tab;

export function PatientRecordModal({ open, initialTab = "overview", locked = false, onClose }: PatientRecordModalProps) {
  const incident = useIncident();
  const dispatch = useIncidentDispatch();
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [subView, setSubView] = useState<SubView>(null);

  // every open starts on the tab the caller asked for (state adjusted during render, no effect)
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTab(initialTab);
      setSubView(null);
    }
  }

  const live = useLiveSource();
  const recording = incident.recordingStartedAt !== null;
  const now = useNow(open && recording);
  const record = buildRecord({ ...incident, base: live.record });
  const patientName = live.session?.epcr?.sections.patient?.name ?? PATIENT.name;
  const recordLabel = live.session ? (live.session.title ?? live.session.captureId) : `Record ${PATIENT.recordNumber}`;
  const responder = user?.role === "paramedic" ? "Unit 4471" : "FF-12";

  function close() {
    setSubView(null);
    onClose();
  }

  function renderBody() {
    if (locked) return <LockedSummary tab={tab} />;
    if (subView === "noteform") {
      return (
        <NoteFormView
          recordedBy={responder}
          onSave={(observation) => {
            dispatch({ type: "observation_added", observation });
            setSubView(null);
            setTab("timeline");
          }}
          onCancel={() => setSubView(null)}
        />
      );
    }
    if (subView === "upload") {
      return (
        <UploadView
          addedBy={responder}
          onAttach={(file) => {
            dispatch({ type: "file_added", file });
            setSubView(null);
            setTab("files");
          }}
          onCancel={() => setSubView(null)}
        />
      );
    }
    switch (tab) {
      case "overview":
        return (
          <OverviewView
            record={record}
            deviceActive={recording}
            deviceElapsed={incident.recordingStartedAt !== null ? elapsed(incident.recordingStartedAt, now) : null}
            onAddObservation={() => setSubView("noteform")}
            onViewTimeline={() => setTab("timeline")}
            onViewFiles={() => setTab("files")}
          />
        );
      case "transcript":
        return <TranscriptView turns={record.transcript} latest={record.latestNote} />;
      case "timeline":
        return <TimelineView events={record.timeline} onAddObservation={() => setSubView("noteform")} onViewFiles={() => setTab("files")} />;
      case "files":
        return (
          <FilesView
            files={record.files}
            onAddFile={() => setSubView("upload")}
            onRemove={(file) => dispatch({ type: "file_deleted", key: fileKey(file) })}
          />
        );
      case "incident":
        return (
          <IncidentView
            notes={incident.incidentNotes}
            onSaveNote={(section, text) => dispatch({ type: "incident_note_saved", section, text, by: responder, at: clockTime() })}
          />
        );
    }
  }

  return (
    <Dialog open={open} onClose={close} label={`Patient record for ${patientName}`} width={1040} height={804}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <h2 className={styles.name}>{locked ? "Identity locked" : patientName}</h2>
          <span className={styles.recordNumber}>{locked ? `${recordLabel} · accept to unlock` : recordLabel}</span>
        </div>
        <label className={styles.search}>
          <input className={styles.searchInput} type="search" placeholder="Search this record" aria-label="Search this record" />
          <Icon name="search" size={16} />
        </label>
        <Button variant="ghostInk" onClick={close}>
          Close
        </Button>
      </header>

      <Tabs tabs={TABS} value={tab} onChange={(next) => { setSubView(null); setTab(next); }} label="Record sections" />

      <div className={styles.body} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {renderBody()}
      </div>

      <footer className={styles.footer}>
        <Button variant="secondary" onClick={close}>
          {locked ? "Close" : "Save"}
        </Button>
      </footer>
    </Dialog>
  );
}
