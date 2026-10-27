# figma audit, 23 oct 2026

20 screens, each loaded at 1440x900 in the state the figma frame shows, screenshot compared
against the frame, and key geometry measured in the dom (`getBoundingClientRect`) against
the frame's values. x, y, w, h in px.

| # | screen | figma | built | result |
|---|--------|-------|-------|--------|
| 1 | step 0 sign in | card 440 @ 500,162, pad 40 | 440 @ 500,162, pad 40 | match (card no longer stretches to page bottom) |
| 2 | fire step 1 new call | app bar 71; gutter 32; h1 28/36 @ y103; cards 809 + 539 @ y235; progress 760; btn 44; row 79 | 71; 32; 28/36 @ 103; 811 + 541 @ 233; 760; 44; 79 | match (±2, border box) |
| 3 | fire step 2 on scene | chip "nightingale active mm:ss", 2 stages lit | ticking chip, 2 lit | match |
| 4 | fire step 3 needs review | review note + finish review | both | match |
| 5 | fire step 4 full record | gutter 24; capture 360 @ 24,168 h716; draft 1008 @ 408; tabs 156x48; inputs 48 | 360 @ 24,173; 1008 @ 408,173 h716; 156x48; 48 | match (y +5) |
| 6 | fire step 5 reviewed | share link 24h; open record + print report 44h; "all caught up" | same | match |
| 7 | overlay a record, before arriving | 1040x804 @ 200,48; header 96; tabs 56; footer 60; readings "--" | 1040x804 @ 200,48; 96; 56; 61; "--" | match |
| 8 | overlay b record, after scene | readings filled, active + online chips | same | match |
| 9 | overlay c field review | 640x600 @ 400,150; speech box; textarea 592x112 | 640x608 @ 400,146; 592x112 | match (±8) |
| 10 | overlay d print | 1184x804 @ 128,48; letter page | 1184x804 @ 128,48; 612x792 page | match |
| 11 | overlay e share | 640x434 @ 400,233; input 48 | 640x434 @ 400,233; 592x48 | match |
| 12 | paramedic step 1 call received | same grid as fire; 4 stages; open record disabled | same | match |
| 13 | paramedic step 2 must accept | no chip; accept record; open disabled | same | match |
| 14 | paramedic step 3 accepted | 2 stages lit; view note; open enabled | same | match |
| 15 | paramedic step 4 verify ask | "review and verify…" one line; red count box | one line; "8 fields" (computed, figma shows 9) | match, count differs by data |
| 16 | paramedic step 5 verify fields | single card 1376 @ 32; red dots on tabs; primary save | 1392 @ 24 (same 24 gutter as fire step 4); dots on patient/clinical/service; blue save | match, gutter unified at 24 |
| 17 | paramedic step 6 qr | "info verified"; blue 153x152 box | same, 153x152 | match |
| 18 | qr overlay | 640 wide @ 400,140 h620; chips; green pill | 640 @ 400,106 h688 | taller by 68 (looser vertical rhythm), content matches |
| 19 | triage step 7 locked | h1 @ 160,80; red "not yet acknowledged"; identity locked | h1 @ 160,80; same | match |
| 20 | triage step 8 confirmed | name chip; green "received by triage"; print + mark as read | same | match |

typography: inter 28/36 title, 18/26 heading, 14/22 body, 14/20 label, 12/18 small,
11/16 caption, 16/24 reading, all from the figma text styles. colours from the figma
variables (`src/styles/tokens.css`).

known differences, on purpose:
- dates and times come from the clock, not the frame's sample values
- the unfilled-field count is computed from the record, not hard coded
- the fire record page and the paramedic record page share the 24 px gutter (the two frames
  disagree: 24 vs 32)

## click-through, 23 oct 2026 (second pass)

every control on every screen clicked as a tester would, with real pointer clicks at 1440x900,
following the figma step notes. what changed as a result:

- sign in: the row's "sign in" link now signs that account in (and asks for the pin if it is
  empty, focusing the field); four digits sign in on their own. before, only the enter key worked.
- fire step 3: "review note" peeks at the record (opens the modal) as the step note says; before
  it did nothing at that step.
- step 4: clicking a transcript line that supports no field now highlights it and says so in
  the footer, instead of silently doing nothing. transcript lines have accessible names.
- record modal: an observation added from the form now appears at the end of the care
  timeline instead of being sorted by the wall clock above the drill's afternoon entries.
- app bar search filters the records list on every home screen ("1 of 6 records").
- paramedic steps 1 and 2: "open record" is no longer a dead disabled button; it opens the
  locked summary the step note describes (hazards, dispatch, identity locked), in the soft blue
  the frame shows. the review card's expand icon and "view record" do the same.
- modal scrim is a light translucent grey instead of the frame's wine red, by request.

checked and left as is: expand icons on both home cards open the record; scrim click, escape,
close and save all close the modal; add observation saves to the timeline; add file / choose
file / cancel; incident accordions; overview "view care timeline" and "view documents and
images" jump tabs; field review clear / restore / cancel / confirm; s.a.m. checkbox; all five
ePCR tabs; share link done / copy link / close; print preview cancel / close (print itself
opens the browser's print sheet); paramedic accept / view note / open record / save / reveal
qr; qr dialog print letter page, done, prototype link; triage confirm receipt, print letter
page, mark as read; both dashboards light "received" afterwards.

## feedback round, 23 oct 2026 (third pass)

changes from chrisandra's walkthrough, each verified in the browser afterwards:

- sign in is a "username" field: clicking it lists alvin and rick; choosing one reveals the
  device pin; four digits (1234 in the demo) sign in. nothing else on the card.
- the name in the app bar opens a small menu (who is signed in, restart demo, sign out).
- the bell carries a red count of unseen alerts and opens a right-hand notifications panel:
  today / yesterday, filters for firefighter / paramedic / handoff, dismiss one or clear all.
  alerts come from the shared story (dispatch, recording, review, shared, accepted, updated,
  received) plus three sample ones from yesterday.
- the decorative expand arrow beside "6 records" is gone; nothing non-clickable is left.
- care timeline has "view documents and images"; files have "remove"; incident sections
  have "add a note" (saved with who and when).
- "open record" opens on overview; "review note" opens on transcript, with the latest
  observation summarised above the full transcript. step 2's review note also moves the call
  into review.
- nothing typed in a demo outlives the tab: the story is kept in sessionStorage, the old
  localStorage copy is removed on load, and "restart demo" wipes it on demand.
- modal scrim is light grey.

open question raised, not built: the hospital side (physician, nurse). see
`hospital-side-research.md`.

## api mode, 23 oct 2026 (integration step 1)

with the api running and `?source=api`, checked against "Case 3 · Dirt bike femur":
home context line names the session; record modal shows the note's patient name, condensed
observation, scene account, the 46 speaker-labelled transcript lines (first voice =
responder) and the scene photo with the pipeline's caption; step 4 shows the note's values in
the ePCR fields, "not captured" where the note is silent, flags from the note only, and the
supporting-speech highlights follow the note's spans. demo mode unchanged.
