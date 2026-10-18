// ugly localhost demo dashboard, not the real tiered-access dashboard from
// ARCHITECTURE.md section 9 (that's packages/web, milestone 5, with actual
// fire/paramedic/ed role-based views). this is just "turn the json into something
// a non technical person can read at a glance" for drills, nothing persists, nothing
// is access controlled. updates the moment something lands: it listens on
// /dev/stream (server-sent events) for device + server logs and "asset changed"
// pings, then re-reads /dev/sessions. a slow 15s poll is only the fallback.
//
// three boxes: the draft epcr (rebuilt server-side from the whole session transcript
// after every chunk, scene photos live in its scene section), the running transcript,
// and the console. sessions are saved to drills/ and reload after a restart

export const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>nightingale, live feed</title>
<style>
  body {
    font-family: -apple-system, system-ui, sans-serif;
    background: #0f1115;
    color: #e8e8ec;
    margin: 0;
    padding: 24px;
  }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #9a9aa5; font-size: 13px; margin-bottom: 16px; }
  .status {
    display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center;
    background: #1a1d24; border: 1px solid #2a2e38; border-radius: 10px;
    padding: 10px 14px; margin-bottom: 16px; font-size: 13px; color: #c7c7d1;
  }
  #new-session {
    background: #8ec6ff; color: #0f1115; border: 0; border-radius: 6px;
    padding: 5px 10px; font-size: 12px; font-weight: 700; cursor: pointer;
  }
  #new-session:hover { background: #b5d9ff; }
  #session-pick[hidden] + #new-session { margin-left: auto; }
  #new-session:disabled { opacity: 0.5; cursor: default; }
  .status select {
    background: #0f1115; color: #e8e8ec; border: 1px solid #2a2e38; border-radius: 6px;
    padding: 3px 6px; font-size: 12px; margin-left: auto;
  }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; background: #5f6471; }
  .dot.on { background: #4cd38a; box-shadow: 0 0 6px #4cd38a; }
  .dot.stale { background: #f0c75e; }
  .dot.off { background: #ff6b6b; }
  .hb { color: #9a9aa5; font-size: 12px; flex-basis: 100%; }

  .layout {
    display: grid; gap: 16px; align-items: start;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) 380px;
  }
  @media (max-width: 1400px) {
    .layout { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .console { grid-column: 1 / -1; }
  }
  @media (max-width: 820px) {
    body { padding: 16px; }
    .layout { grid-template-columns: 1fr; }
  }
  .box {
    background: #1a1d24; border: 1px solid #2a2e38; border-radius: 10px;
    display: flex; flex-direction: column; max-height: calc(100vh - 190px); min-height: 320px;
  }
  .box-head {
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
    padding: 12px 16px; border-bottom: 1px solid #262a33; font-size: 13px; color: #9a9aa5;
  }
  .box-head b { color: #e8e8ec; font-size: 14px; }
  .box-body { overflow-y: auto; padding: 14px 16px; }

  .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; margin-bottom: 14px; }
  .thumb {
    position: relative; aspect-ratio: 1; padding: 0; border: 1px solid #2a2e38; border-radius: 6px;
    overflow: hidden; cursor: zoom-in; background: #0f1115;
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .thumb span {
    position: absolute; left: 0; right: 0; bottom: 0; padding: 2px 5px;
    background: rgba(0,0,0,.6); color: #c7c7d1; font-size: 10px; text-align: left;
  }
  .thumb.pending { display: grid; place-items: center; color: #6a6a75; font-size: 11px; cursor: default; }

  .epcr-meta { font-size: 12px; color: #6a6a75; margin-bottom: 12px; }
  .epcr-meta.updating { color: #8ec6ff; }
  .sec { border: 1px solid #262a33; border-radius: 8px; margin-bottom: 10px; overflow: hidden; }
  .sec-title {
    background: #20242d; padding: 6px 10px; font-size: 11px; font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase; color: #9aa3b5;
  }
  .kv { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
  .kv > div { padding: 6px 10px; border-top: 1px solid #22262e; border-right: 1px solid #22262e; min-width: 0; }
  .kv .wide { grid-column: 1 / -1; }
  .k { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #5f6471; }
  .v { font-size: 14px; line-height: 1.4; color: #e8e8ec; overflow-wrap: anywhere; }
  .v.blank { color: #3c414d; }
  .changed { animation: flash 2.4s ease-out; }
  @keyframes flash { from { background: rgba(142, 198, 255, 0.28); } to { background: transparent; } }
  table.grid { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.grid th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #5f6471; font-weight: 600; }
  table.grid th, table.grid td { padding: 5px 8px; border-top: 1px solid #22262e; }
  .sec .photos { padding: 8px 10px 0; margin-bottom: 8px; }
  .sec .flag { padding: 0 10px 8px; }
  .draft-badge {
    display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.03em;
    color: #0f1115; background: #f0c75e; padding: 2px 8px; border-radius: 4px;
  }
  .group { margin-bottom: 12px; }
  .group-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
    color: #5f6471; margin-bottom: 3px;
  }
  .field { margin: 2px 0; font-size: 14px; line-height: 1.45; }
  .field b { color: #c7c7d1; font-weight: 600; }
  .flag { font-size: 13px; font-weight: 600; color: #ffb454; margin-top: 10px; }
  .empty { color: #6a6a75; font-size: 14px; }

  .chunk { margin-bottom: 14px; }
  .chunk-head { font-size: 11px; color: #6a6a75; margin-bottom: 4px; }
  .chunk-text { font-size: 14px; line-height: 1.55; color: #d6d6de; }
  .chunk-text .spk { color: #6a6a75; font-size: 11px; margin-right: 6px; }
  .chunk-text .nonresp { color: #ffb454; }
  .working { color: #8ec6ff; font-size: 13px; }
  .live-now .chunk-text { color: #ffffff; }
  .who { font-weight: 700; font-size: 12px; margin-right: 8px; }
  .live-who { color: #6a6a75; font-weight: 600; }
  .cursor {
    display: inline-block; width: 7px; height: 1em; margin-left: 3px; vertical-align: -2px;
    background: #8ec6ff; animation: blink 1s steps(2, start) infinite;
  }
  @keyframes blink { to { visibility: hidden; } }
  .muted { color: #6a6a75; font-size: 13px; font-style: italic; }
  .failed { color: #ff6b6b; font-size: 13px; }

  .console { background: #0a0b0e; }
  .console-head label { font-size: 12px; }
  #log { font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .ln { white-space: pre-wrap; word-break: break-word; }
  .ln .t { color: #5f6471; }
  .ln .src { color: #8ec6ff; }
  .ln .src.server { color: #b79cff; }
  .ln.warn { color: #f0c75e; }
  .ln.error { color: #ff6b6b; }
  .ln.hb-line { color: #6a6a75; }

  .lightbox {
    position: fixed; inset: 0; background: rgba(5,6,8,.92); display: none;
    flex-direction: column; align-items: center; justify-content: center; gap: 12px;
    padding: 24px; z-index: 10; cursor: zoom-out;
  }
  .lightbox.open { display: flex; }
  .lightbox img { max-width: 100%; max-height: calc(100vh - 140px); border-radius: 8px; }
  .lightbox .cap { max-width: 720px; text-align: center; font-size: 15px; line-height: 1.45; color: #e8e8ec; }
  .lightbox .meta { font-size: 12px; color: #9a9aa5; }
</style>
</head>
<body>
  <h1>nightingale, live feed</h1>
  <div class="sub">updates the moment something lands. everything below is a draft, nobody's approved it yet, that's the whole point</div>
  <div class="status">
    <span><span class="dot" id="conn-dot"></span><span id="conn">connecting to api...</span></span>
    <span><span class="dot" id="dev-dot"></span><span id="dev">no device heard from yet</span></span>
    <select id="session-pick" hidden></select>
    <button id="new-session" title="start a fresh session from now on. the current one stays saved">New session</button>
    <span class="hb" id="hb"></span>
  </div>

  <div class="layout">
    <section class="box">
      <div class="box-head"><b>ePCR</b><span class="draft-badge">draft, pending review</span></div>
      <div class="box-body" id="form"><div class="empty">waiting for the first capture...</div></div>
    </section>
    <section class="box">
      <div class="box-head"><b>transcript</b><span id="tx-count"></span></div>
      <div class="box-body" id="transcript"><div class="empty">nothing heard yet</div></div>
    </section>
    <section class="box console">
      <div class="box-head console-head">
        <b>console</b>
        <label><input type="checkbox" id="show-hb" /> show heartbeats</label>
      </div>
      <div class="box-body" id="log"></div>
    </section>
  </div>

  <div class="lightbox" id="lightbox">
    <img id="lb-img" alt="" />
    <div class="cap" id="lb-cap"></div>
    <div class="meta" id="lb-meta"></div>
  </div>

<script>
function esc(v) {
  return String(v).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function timeOf(ms) {
  return new Date(ms).toLocaleTimeString();
}

// ---- epcr: the session-wide draft the server rebuilds after every chunk ----

let prevValues = {}; // field path -> last rendered value, to flash what changed
let nextValues = {};

function cell(path, label, value, wide) {
  const text = Array.isArray(value) ? value.join(", ") : value;
  const filled = text !== undefined && text !== null && text !== "";
  nextValues[path] = filled ? String(text) : "";
  const changed = filled && prevValues[path] !== undefined && prevValues[path] !== String(text);
  return '<div class="' + (wide ? "wide " : "") + (changed ? "changed" : "") + '"><div class="k">' + label +
    '</div><div class="v' + (filled ? "" : " blank") + '">' + (filled ? esc(text) : "\u2014") + '</div></div>';
}

function sec(title, inner) {
  return '<div class="sec"><div class="sec-title">' + title + '</div>' + inner + '</div>';
}

function kv(cells) {
  return '<div class="kv">' + cells.join("") + '</div>';
}

function table(cols, rows, path) {
  if (!rows || !rows.length) return kv([cell(path, "none recorded yet", "", true)]);
  const html = '<table class="grid"><tr>' + cols.map((c) => '<th>' + c[1] + '</th>').join("") + '</tr>' +
    rows.map((r) => '<tr>' + cols.map((c) => '<td>' + esc(r[c[0]] || "") + '</td>').join("") + '</tr>').join("") +
    '</table>';
  const key = JSON.stringify(rows);
  const changed = prevValues[path] !== undefined && prevValues[path] !== key;
  nextValues[path] = key;
  return changed ? '<div class="changed">' + html + '</div>' : html;
}

function photoSrc(session, a) {
  return a.file ? "/dev/files/" + encodeURIComponent(session.dir) + "/" + a.file : "/assets/" + a.assetId + "/download";
}

function renderPhotos(session, photos) {
  if (!photos.length) return "";
  return '<div class="photos">' + photos.map((a) =>
    '<button class="thumb" data-photo="' + a.assetId + '"><img src="' + photoSrc(session, a) + '" alt="" /><span>' +
    (a.status === "processing" ? "captioning..." : timeOf(a.completedAt)) + '</span></button>').join("") + '</div>';
}

// layout follows a standard epcr: incident, scene, patient, complaint/history, sample,
// vitals, assessment, interventions, transport, narrative. every section always shows,
// blanks fill in as the transcript grows. no impression/diagnosis field on purpose
function renderEpcr(session, photos) {
  const s = (session.epcr && session.epcr.sections) || {};
  const inc = s.incident || {}, t = inc.times || {}, sc = s.scene || {}, p = s.patient || {};
  const sa = s.sample || {}, o = s.opqrst || {}, tr = s.transport || {};
  nextValues = {};

  let html = "";
  html += sec("Incident", kv([
    cell("inc.location", "Location", inc.location, true),
    cell("inc.dispatch", "Dispatch reason", inc.dispatchReason),
    cell("inc.units", "Units on scene", inc.unitsOnScene),
    cell("t.call", "Call received", t.callReceived), cell("t.enroute", "En route", t.enRoute),
    cell("t.onscene", "On scene", t.onScene), cell("t.contact", "Patient contact", t.patientContact),
    cell("t.depart", "Depart scene", t.departScene), cell("t.dest", "At destination", t.atDestination),
  ]));
  html += sec("Scene", kv([
    cell("sc.patients", "# patients", sc.numberOfPatients),
    cell("sc.env", "Environment", sc.environment),
    cell("sc.safety", "Safety / hazards", [sc.safety, s.hazards].filter(Boolean).join("; "), true),
    cell("sc.others", "Others on scene", sc.othersOnScene, true),
  ]) + (photos.length ? '<div class="k" style="padding:8px 10px 0">scene photos, click to enlarge</div>' + renderPhotos(session, photos) : ""));
  html += sec("Patient", kv([
    cell("p.name", "Name", p.name), cell("p.age", "Age", p.age), cell("p.sex", "Sex", p.sex),
    cell("p.dob", "DOB", p.dob), cell("p.weight", "Weight", p.weight), cell("p.capacity", "Capacity", p.capacity),
    cell("p.dm", "Decision maker", p.decisionMaker), cell("p.family", "Family contact", s.familyContact, true),
  ]));
  html += sec("Chief complaint and history", kv([
    cell("cc", "Chief complaint", s.chiefComplaint, true),
    cell("moi", "Mechanism / what happened", s.mechanismOrComplaint, true),
    cell("timeline", "Timeline", s.timeline, true),
    cell("o.o", "Onset", o.onset), cell("o.p", "Provocation", o.provocation), cell("o.q", "Quality", o.quality),
    cell("o.r", "Radiation", o.radiation), cell("o.s", "Severity", o.severity), cell("o.t", "Time", o.time),
  ]));
  html += sec("SAMPLE", kv([
    cell("sa.ss", "Signs / symptoms", sa.signsSymptoms, true),
    cell("sa.allergies", "Allergies", sa.allergies), cell("sa.meds", "Medications", sa.medications),
    cell("sa.past", "Past history", sa.pastHistory), cell("sa.lunch", "Last oral intake", sa.lastOralIntake),
    cell("sa.events", "Events leading up", sa.events, true),
  ]));
  html += sec("Vitals", table([["time", "Time"], ["loc", "LOC"], ["bp", "BP"], ["hr", "HR"], ["rr", "RR"],
    ["spo2", "SpO2"], ["gcs", "GCS"], ["temp", "Temp"], ["glucose", "BGL"], ["pain", "Pain"], ["skin", "Skin"]], s.vitals, "vitals"));
  html += sec("Assessment", kv([
    cell("cond", "Condition observed (LOC, ABCs)", s.conditionObserved, true),
    cell("exam", "Physical exam", s.physicalExam, true),
  ]));
  html += sec("Interventions", table([["time", "Time"], ["intervention", "Intervention"], ["response", "Response"]],
    s.interventions, "interventions") +
    (s.interventionsPerformed && !(s.interventions || []).length ? kv([cell("intsum", "Summary", s.interventionsPerformed, true)]) : ""));
  html += sec("Transport and handoff", kv([
    cell("tr.dest", "Destination", tr.destination), cell("tr.priority", "Priority", tr.priority),
    cell("tr.pos", "Position", tr.position), cell("tr.handoff", "Handed off to", tr.handoffTo),
    cell("belongings", "Belongings", s.belongings, true),
  ]));
  html += sec("Bystander statements", kv([cell("bystander", "Said by non-responders (review before sharing)", s.bystanderStatements, true)]));
  html += sec("Narrative", kv([cell("narrative", "AI summary of what was said and done", s.narrative, true)]));

  const flags = (session.epcr && session.epcr.flags) || [];
  if (flags.length) {
    html += sec("Needs review before approval", '<div class="flag" style="padding:8px 10px">' +
      flags.map((f) => "&#9888; " + esc(f.type.replace(/_/g, " ") + (f.note ? ": " + f.note : ""))).join("<br>") + '</div>');
  }
  prevValues = nextValues;
  return html;
}

function epcrMeta(session) {
  if (session.epcrStatus === "updating") return '<div class="epcr-meta updating">updating from the latest transcript...</div>';
  if (session.epcrStatus === "failed") return '<div class="epcr-meta" style="color:#ff6b6b">last update failed, see console</div>';
  if (session.epcr) return '<div class="epcr-meta">updated ' + timeOf(session.epcrUpdatedAt) + ' from ' + session.epcrChunks + ' line' + (session.epcrChunks === 1 ? "" : "s") + ' of transcript</div>';
  return '<div class="epcr-meta">fills in as the transcript comes in</div>';
}

let photosById = {};
let currentSession = null;

// ---- transcript ----

// live lines appear word by word straight away (no speaker yet). once the saved chunk
// for that stretch comes back speaker-labelled, its labelled lines replace the live ones.
// silence never shows. same rules as transcriptEntries() in drills.ts
let partials = {}; // sessionId -> { itemId: {text, startedAt} }, words still arriving

function transcriptEntries(session) {
  const entries = [];
  const labelled = [];
  for (const a of session.assets) {
    if (a.kind !== "audio") continue;
    const start = a.capturedAt || a.completedAt;
    if (a.status === "ready" && a.transcript) {
      labelled.push([start, start + (a.durationMs || 30000)]);
      for (const seg of a.transcript) {
        const last = entries[entries.length - 1];
        if (last && last.kind === "labelled" && last.speaker === seg.speaker && last.file === a.file) last.text += " " + seg.text;
        else entries.push({ at: seg.at || start, text: seg.text, speaker: seg.speaker, kind: "labelled", file: a.file, review: seg.nonResponder });
      }
    } else if (a.status === "failed") {
      entries.push({ at: start, kind: "failed" });
    }
  }
  const covered = (t) => labelled.some(([s, e]) => t >= s && t < e);
  for (const t of session.liveTurns || []) {
    if (t.text && !covered(t.startedAt)) entries.push({ at: t.startedAt, text: t.text, kind: "live" });
  }
  for (const p of Object.values(partials[session.captureId] || {})) {
    if (p.text.trim()) entries.push({ at: p.startedAt, text: p.text, kind: "partial" });
  }
  return entries.sort((x, y) => x.at - y.at);
}

const SPEAKER_COLOURS = ["#8ec6ff", "#f0a6ca", "#9be29b", "#f0c75e", "#c3a6ff", "#ff9f7a"];
function speakerColour(name) {
  const n = parseInt(String(name).replace(/\D/g, ""), 10);
  return SPEAKER_COLOURS[((isNaN(n) ? 1 : n) - 1) % SPEAKER_COLOURS.length];
}

function renderEntry(e) {
  let who = "";
  if (e.kind === "labelled") who = '<span class="who" style="color:' + speakerColour(e.speaker) + '">' + esc(e.speaker) + '</span>';
  else if (e.kind === "live" || e.kind === "partial") who = '<span class="who live-who">live</span>';
  const head = '<div class="chunk-head">' + who + timeOf(e.at) + (e.review ? " \u00b7 non-responder, review" : "") + '</div>';
  let body;
  if (e.kind === "partial") body = '<div class="chunk-text">' + esc(e.text) + '<span class="cursor"></span></div>';
  else if (e.kind === "failed") body = '<div class="failed">couldn\u2019t label this stretch, see console</div>';
  else body = '<div class="chunk-text">' + esc(e.text) + '</div>';
  return '<div class="chunk' + (e.kind === "partial" ? " live-now" : "") + '">' + head + body + '</div>';
}

function renderTranscript() {
  if (!currentSession) return;
  const txEl = document.getElementById("transcript");
  const stick = atBottom(txEl);
  const txScroll = txEl.scrollTop;
  const entries = transcriptEntries(currentSession);
  txEl.innerHTML = entries.length ? entries.map(renderEntry).join("")
    : '<div class="empty">nothing said yet. words show up here as they are spoken</div>';
  txEl.scrollTop = stick ? txEl.scrollHeight : txScroll;
  const lines = entries.filter((e) => e.kind === "live" || e.kind === "labelled").length;
  const voices = (currentSession.speakers || []).length;
  document.getElementById("tx-count").textContent =
    "saved to drills/" + currentSession.dir + (lines ? " \u00b7 " + lines + " line" + (lines > 1 ? "s" : "") : "") +
    (voices ? " \u00b7 " + voices + " voice" + (voices > 1 ? "s" : "") : "");
}

// ---- render ----

let sessions = [];
let pickedSession = null; // null = follow the newest one

function atBottom(el) {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
}

function render() {
  if (!sessions.length) return;
  sessions.sort((x, y) => y.startedAt - x.startedAt);

  const pick = document.getElementById("session-pick");
  pick.hidden = sessions.length < 2;
  const current = pickedSession && sessions.find((s) => s.captureId === pickedSession)
    ? pickedSession : sessions[0].captureId;
  pick.innerHTML = sessions.map((s, i) =>
    '<option value="' + esc(s.captureId) + '"' + (s.captureId === current ? " selected" : "") + '>' +
    esc(new Date(s.startedAt).toLocaleString()) + ' \u00b7 ' + esc(s.captureId) + (i === 0 ? " (latest)" : "") + '</option>').join("");

  const session = sessions.find((s) => s.captureId === current);
  if (!currentSession || currentSession.captureId !== session.captureId) prevValues = {}; // no flashing on switch
  currentSession = session;
  const byTime = (x, y) => x.completedAt - y.completedAt;
  const photos = session.assets.filter((a) => a.kind === "photo").sort(byTime);
  photosById = Object.fromEntries(photos.map((a) => [a.assetId, a]));

  const formEl = document.getElementById("form");
  const formScroll = formEl.scrollTop;
  formEl.innerHTML = epcrMeta(session) + renderEpcr(session, photos);
  formEl.scrollTop = formScroll;

  renderTranscript();
}

async function refresh() {
  try {
    const res = await fetch("/dev/sessions");
    if (!res.ok) return;
    sessions = await res.json();
  } catch { return; }
  render();
}

let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 100);
}

// fresh session from now on (own drills/ folder, empty epcr, speakers from Person 1).
// the pi keeps recording, nothing restarts, the old session stays saved
document.getElementById("new-session").addEventListener("click", async (e) => {
  const button = e.target;
  button.disabled = true;
  button.textContent = "starting...";
  try {
    const res = await fetch("/dev/sessions/new", { method: "POST" });
    if (res.ok) {
      pickedSession = null; // follow the new one
      await refresh();
      button.textContent = "started \u2713";
    } else {
      button.textContent = "failed, see console";
    }
  } catch {
    button.textContent = "api unreachable";
  }
  setTimeout(() => { button.disabled = false; button.textContent = "New session"; }, 1500);
});

document.getElementById("session-pick").addEventListener("change", (e) => {
  pickedSession = e.target.selectedIndex === 0 ? null : e.target.value;
  render();
});

// ---- lightbox ----

const lightbox = document.getElementById("lightbox");
document.getElementById("form").addEventListener("click", (e) => {
  const thumb = e.target.closest("[data-photo]");
  if (!thumb) return;
  const a = photosById[thumb.dataset.photo];
  if (!a) return;
  document.getElementById("lb-img").src = photoSrc(currentSession, a);
  document.getElementById("lb-cap").textContent =
    a.caption || (a.status === "failed" ? "captioning failed" : "captioning...");
  document.getElementById("lb-meta").textContent = "taken " + timeOf(a.completedAt) + " \\u00b7 click or esc to close";
  lightbox.classList.add("open");
});
lightbox.addEventListener("click", () => lightbox.classList.remove("open"));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") lightbox.classList.remove("open"); });

// ---- console ----

const logEl = document.getElementById("log");
const showHb = document.getElementById("show-hb");
let lastDevice = null; // { id, ts }

function appendLog(line) {
  const isHb = line.msg.startsWith("[heartbeat]");
  if (line.source !== "server") {
    lastDevice = { id: line.source, ts: Date.now() };
    if (isHb) document.getElementById("hb").textContent = line.source + " " + line.msg + " (" + timeOf(line.ts) + ")";
    updateDeviceStatus();
  }
  if (isHb && !showHb.checked) return;
  const stick = atBottom(logEl);
  const div = document.createElement("div");
  div.className = "ln " + line.level + (isHb ? " hb-line" : "");
  div.innerHTML = '<span class="t">' + timeOf(line.ts) + '</span> <span class="src ' +
    (line.source === "server" ? "server" : "") + '">' + esc(line.source) + '</span> ' + esc(line.msg);
  logEl.appendChild(div);
  while (logEl.childNodes.length > 600) logEl.removeChild(logEl.firstChild);
  if (stick) logEl.scrollTop = logEl.scrollHeight;
}

// heartbeat is every 30s, so >45s of silence means the pi's off or lost the network
function updateDeviceStatus() {
  const dot = document.getElementById("dev-dot");
  const label = document.getElementById("dev");
  if (!lastDevice) return;
  const ago = Math.round((Date.now() - lastDevice.ts) / 1000);
  dot.className = "dot " + (ago < 45 ? "on" : ago < 120 ? "stale" : "off");
  label.textContent = lastDevice.id + (ago < 45 ? " is on" : " quiet") + ", last heard " + ago + "s ago";
}
setInterval(updateDeviceStatus, 1000);

function setConn(ok, text) {
  document.getElementById("conn-dot").className = "dot " + (ok ? "on" : "off");
  document.getElementById("conn").textContent = text;
}

const es = new EventSource("/dev/stream");
es.onopen = () => { setConn(true, "api connected, live"); logEl.innerHTML = ""; refresh(); };
es.onerror = () => setConn(false, "api unreachable, retrying...");
es.addEventListener("log", (e) => appendLog(JSON.parse(e.data)));
es.addEventListener("update", scheduleRefresh);
// words as they're spoken: patch the transcript box straight away, no refetch
es.addEventListener("transcript", (e) => {
  const t = JSON.parse(e.data);
  const bucket = (partials[t.sessionId] = partials[t.sessionId] || {});
  if (t.final) delete bucket[t.id]; // the saved line arrives with the next refresh
  else bucket[t.id] = { text: t.text, startedAt: t.startedAt };
  if (currentSession && currentSession.captureId === t.sessionId) renderTranscript();
});

refresh();
setInterval(refresh, 15000);
</script>
</body>
</html>`;
