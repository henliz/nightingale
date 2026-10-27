# what the hospital side could be, from the data we have

thinking only. nothing here is built. sources: the scene-to-hospital handoff survey
(28 responses, 19 to 22 oct 2026: 24 paramedics, 4 ER nurses, toronto-heavy, no physicians),
faith's interview (clinical extern, michael garron emerg, 2 years) and austin's interview
(RN, guelph general emerg, 19 oct 2026).

## what the data says

**the handoff is spoken, and that part works.** every survey respondent said fire passes
information by verbal report only (two added a handwritten note). faith: the only physical
thing the hospital gets from paramedics is a printed ECG strip. austin: "we write everything
down", paper chart, a printed triage blurb, verbal report at the room. faith wants the verbal
handoff kept: "you capture more of a story when you're physically talking to someone."

**what goes missing is the stuff that is not urgent at the bedside.** the four nurses named:
current medications, relevant history, family or emergency contact, what the patient looked
like when responders arrived, mechanism or onset, code status and goals of care. one found
the medications later through ConnectingOntario. austin: if the crew has left, "we work it
out by assessing the patient ourselves." faith: belongings left in the ambulance and no way
to find that crew. nothing travels with the patient, so nothing can be looked up later.

**doctors never hear the paramedics.** faith: paramedic → triage nurse (verbal) → zone nurse
(verbal plus notes) → doctor (reads notes). "you just gotta trust that whoever received that
information is documenting the correct information." the physician is three links down a
chain with no written source at the start.

**the story can mislead.** the oshawa nurse's case: COPD history, "oxygen ran out", patched
as a COPD exacerbation, arrived as a brain bleed. medical history shapes how symptoms get
interpreted. nurses want what was observed, with time, separated from what was concluded.

**there is no time to read.** nurses: "1 to 30 seconds", "we often don't have time",
"give the quick and dirty and we figure out the rest". hamilton: "if you're thinking AI
involvement do not waste your time." paramedics: "i'd rather get history myself." offload
delay and triage queues are the real bottlenecks, not information.

**pre-arrival already exists and is tiny.** austin: a phone from the ambulance for the sicker
patients, a nurse writes ETA, age, severity, complaint on the wall. faith: same, verbal, for
critical patients. bracebridge: "they quit patching for CTAS 3 and greater because we didn't
have the time."

**the ED is paper until admission.** faith: cerner/powerchart only once admitted; discharged
patients stay on paper. austin: barely use the computers. IPASS (illness severity, patient
summary, action list, situational awareness, synthesis) is the handoff structure at michael
garron, verbal plus an electronic document in the same shape.

## so why a digital version at all

not to replace the verbal handoff. to leave something behind when it ends:

1. **a record that outlives the conversation.** the moment the crew leaves, the ED has no
   way to recover a forgotten detail, a med list, a contact number, or to find the crew.
2. **a source the doctor can read.** today the physician reads the nurse's version of the
   nurse's version. a first responder record filed in the chart is one link, not three.
3. **observations with provenance.** "found seated, awake, confused, 14:02, FF-12" cannot be
   re-interpreted into a diagnosis the way "COPD, oxygen ran out" was.
4. **the pre-arrival call, written down once.** the wall note is the smallest handoff that
   exists and it is re-typed by hand at every hospital.

## what we could build (hospital side), smallest first

**1. the first responder sheet, printed.** faith asked for exactly this: a standardized form
the paramedics fill on scene that is printed or sent and filed in the chart. the ED is paper,
so the artifact is paper. our Letter page already exists; the hospital version reorders it
to IPASS/IMIST-AMBO (illness severity first, then the story, then what is pending), puts
"what the patient looked like on arrival" and code status at the top, and carries a QR to
the live version. no EMR integration, no training, nothing for the nurse to read beyond the
blurb she already reads.

**2. the wall card.** the pre-arrival call as a one-line push: ETA, age, CTAS, complaint,
the paramedic's impression, latest vitals, "what we did". it is what austin's nurse writes on
the wall and faith's hospital prepares a bed from. read in the 1 to 30 seconds nurses gave us.
it comes from the paramedic's verified record, so it costs the crew nothing on scene (the
survey's limit: zero to 30 extra seconds).

**3. ask the crew.** a time-boxed channel from the handoff page back to the crew: "which
ambulance was this", "was there a med list", "the patient's cane". austin recovers missing
details only while the crew is still in the unit; faith has no way to trace a crew for
belongings. a 4 hour window after handoff with a logged, read-only thread covers both.

**4. pre-treatment wound photo.** austin's one concrete image idea: the wound before it is
dressed, so the hospital can judge how it changes. narrow, consented, purpose-tagged, time
stamped, attached to the same record. not scene photography in general (faith has never
seen a photo shared and did not miss it).

**5. the physician view is the record, not a screen.** doctors do not talk to paramedics
and will not open another app. the handoff page already works without an account; the printed
sheet already carries the QR. a doctor who wants the source opens that. admitted patients are
the one case where a copy into cerner or epic matters, and that is a FHIR export later, not
an MVP feature.

## what the data says not to build

- anything that adds on-scene time for paramedics. "nothing", "i'll get it myself",
  "accurate is all i care about" is the majority voice. fire's contribution they value is
  accurate vitals, age and weight, patient count, hazards and PPE, and updates on condition.
- AI summaries aimed at nurses. one said so in those words, the rest said they have no time
  to read. anything surfaced to the ED has to be shorter than the phone call.
- a replacement for the verbal report. both interviews want it kept.
- a general-purpose hospital dashboard. emerg is paper and will not log into a second system.

## limits of the data

28 self-selected responses, four of them nurses, none physicians, most in toronto; two
interviews, one an extern. no observation of a real handoff yet. before building any of the
above: watch three handoffs, count how long the nurse spends with the printed blurb, and ask
a physician what they would do with the source record if it were in the chart. austin's open
questions (what is on the wall, what makes it into the triage sheet, when a nurse declines a
report) are the right next interview.

## how hospital people would touch the fire and paramedic flows, and the systems already there

the two flows we built end at "received by triage". everything after that happens in a
hospital that runs on paper in emerg, cerner/powerchart or epic once admitted, CTAS for
acuity, IPASS for handoff, and ConnectingOntario for looking things up. here is where each
hospital role meets our record, what is in the way, and what to do about it.

| role | touches our flow where | what they have today | gap | suggestion |
|------|------------------------|----------------------|-----|------------|
| **registration clerk** | first contact on arrival, before triage (faith) | health card, wristband, patient entered in the system | our record has the patient's name and health card photo only after acceptance; the clerk never sees it | print the Letter page with a registration strip at the top (name, DOB, health card if captured, call id). nothing to log into; it goes in the chart like the ECG strip does today |
| **triage nurse** | hears the paramedic's verbal report, types the story, vitals and safety flags, assigns CTAS and a zone (faith, austin) | 1 to 30 seconds, a wall note for patched calls, the paramedic's own vitals monitor | she re-types what the paramedic already verified; she is the one the survey says is missing meds, history, contact, "what the patient looked like on arrival", code status | the wall card (section above) arrives before the ambulance for CTAS 1 and 2; the Letter page arrives with it for the rest. order it the way she types: story, vitals, safety flags, then IMIST-AMBO. do not try to replace her typing; give her something to copy from |
| **charge nurse** | assigns the room (austin) | the triage sheet | none of our data; she only needs acuity and a bed | nothing to build. the wall card's ETA and CTAS line is all she would read |
| **zone / room nurse** | second verbal report from the paramedic at the stretcher (austin, faith) | the printed triage blurb at the front of the chart, then paper charting | the only written source is the triage nurse's version; a detail the paramedic forgot is gone once the crew leaves; belongings can't be traced | the QR on the Letter page opens the read-only handoff page in a normal browser (built). add "ask the crew" (4 hour window) and the paramedic unit id so belongings and omissions have a path back |
| **ER physician** | never speaks to paramedics (faith); reads nurse notes | nurse documentation, diagnostics, ConnectingOntario for history | three links from the source. the oshawa case shows the story can be reframed on the way | no physician app. the physician's entry point is the same QR / handoff page, opened from the chart. keep it observations-with-time-and-source, no impression field, so the doctor reads what was seen, not what someone concluded |
| **admitting team / inpatient unit** | only if admitted (faith) | cerner/powerchart or epic, IPASS document | our record stays in the paper emerg chart; the inpatient EHR never gets it | later: a FHIR DocumentReference export of the approved note into the hospital EHR when a patient is admitted. not an MVP item; it needs a hospital IT agreement first |
| **hospital privacy / records** | audit, access requests, holds | provincial privacy law, charts restricted to the care team | a link that opens in any browser worries privacy people more than a paper sheet does | the handoff link is one-time, time-boxed, every open logged (already in the design); print the access log on request. that is the answer to "who opened this" |

### what the existing systems mean for us

- **paper emerg chart.** the thing that travels is paper. the Letter page is not a fallback,
  it is the primary hospital artifact. design it to be filed, stapled and read in 30 seconds.
- **cerner / epic.** only for admitted patients, only via hospital IT, only after a pilot.
  do not promise an integration; promise a clean export format (FHIR) and a printed page.
- **ConnectingOntario.** nurses already use it to find medications later. our record should
  say where its med list came from ("photo of the list at home, 14:10") so the nurse knows
  whether to still check ConnectingOntario.
- **CTAS.** decides whether anyone has time to read. the wall card goes to CTAS 1 and 2
  (the patched calls). CTAS 3 to 5 get the sheet in the chart and nothing pushed.
- **IPASS.** the hospital's own handoff shape. the printed page and the handoff page should
  map onto it (illness severity first, then summary, then pending actions, then what to watch
  for), so a nurse can read ours into her IPASS without translating.
- **the ambulance phone and the wall.** the smallest working pre-arrival channel. our wall
  card should not replace the call; it should be what the nurse writes down after it, already
  written.

### the gaps, in priority order

1. nothing written reaches the hospital from the paramedic today (faith, austin, all four
   nurses). the printed Letter page plus the QR closes this without touching any hospital system.
2. missing-later details (meds, history, contact, code status, what the patient looked like
   on arrival) have no retrieval path once the crew leaves. the handoff page plus "ask the
   crew" closes this.
3. the physician reads a third-hand story. the same handoff page, reachable from the chart,
   closes this without a physician product.
4. pre-arrival exists only as a phone call and a wall note. the wall card is the digital
   version; only for the calls that already get a call.
5. admitted patients lose the record at the EHR boundary. FHIR export later.

### what to ask next

- a triage nurse: watch three handoffs, time the printed blurb, ask what she would copy from
  our sheet and what she would ignore.
- a physician: "if the first responder record were in the chart, would you open it, and
  when?" (none in the survey, none interviewed).
- hospital IT or privacy at guelph general or michael garron: what would make a time-boxed
  link acceptable, and what a FHIR document would need to carry.
- austin's open questions: what exactly goes on the wall, what from the paramedic reaches
  the triage sheet, and when a nurse declines a report.
