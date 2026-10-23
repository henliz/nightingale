# plugging the dashboard into the rest of nightingale

the dashboard (`packages/web`) runs on an in-browser story today. the api (`packages/api`)
already produces the real thing the dashboard pretends to have: a `DraftNote` rebuilt from
the whole transcript after every chunk, speaker-labelled transcript lines, photos in the
vault, a hash-chained audit log, and a server-sent event stream. this is how the two meet
without rewriting either.

## what the api has today (milestones 0 to 3 and 9)

| api today | what the dashboard shows |
|-----------|--------------------------|
| `GET /dev/sessions` → `DrillSession[]`, each with `epcr?: DraftNote`, `assets`, `transcript` (speaker, text, nonResponder, at), `speakers`, `epcrStatus` | current call card, record modal (overview, transcript, files), step 4 ePCR draft |
| `GET /assets/:id/note` → `DraftNote` (`sections`, `spans`, `flags`) | ePCR fields, "supporting speech" (spans → transcript ids), red flagged fields (`flags`) |
| `GET /assets/:id/download`, `GET /assets/:id/caption` | files tab, photo thumbnails |
| `GET /dev/stream` (SSE: log lines + "something changed") | the live chip, "paramedics updated this record", bell alerts |
| `GET /_audit` | who did what and when, behind every provenance line |
| `POST /captures/:id/assets` … `/complete` | the device side; the dashboard never calls these |

port 8787 (`PORT`), hono, zod, `@nightingale/schema` types. the dashboard already depends on
`@nightingale/schema`, so `DraftNote`, `NoteSections`, `Transcript`, `AccessGrant`,
`Provenance` are the shared vocabulary; nothing new needs inventing.

## what the api does not have yet (milestones 4 and 5)

the dashboard's story has steps the server has no words for. each one is a small route, and
each one is an audit event:

| dashboard action (today a reducer case) | needs on the server |
|------------------------------------------|---------------------|
| sign in (alvin / rick, device pin) | a session: `POST /auth/device` → `{ responderId, orgId, role }`; sets the actor on every later audit event |
| list of calls, "current call" | `GET /incidents` for my org, `GET /incidents/:id` with its captures and latest note |
| `review_started`, `field_reviewed` | `PATCH /notes/:id/fields` with `{ field, value, status }` → stored as `Provenance` (`responder_edit`), audited |
| `review_saved` (fire step 4 save) | `POST /notes/:id/approve` → `ApprovedNote` (`approvedBy`, `approvedAt`, `approvedAssetIds`) |
| `shared` (share link) | `POST /grants` `{ noteId, orgId: paramedic service, tier: "paramedic" }` → `AccessGrant` |
| `accepted` | `POST /grants/:id/accept` (new audit event `grant.accepted`); unlocks identity fields for that org |
| `verified` (paramedic step 5 save) | same `PATCH /notes/:id/fields` as the paramedic actor, then `POST /notes/:id/revisions` → version n+1 (the "version 3" on the handoff page) |
| reveal qr / handoff link | `POST /handoff` → `{ token, expiresAt }` = an `AccessGrant` with `tier: "ed"` and a 4 h `expiresAt`; `GET /handoff/:token` serves the summary with identity masked |
| `received` (triage confirm) | `POST /handoff/:token/receipt` → sets `Incident.destinationConfirmed`, audits `handoff.received` |
| `observation_added`, `file_added`, `incident_note_saved` | observations and notes are note revisions; files go through the existing asset routes with `photoPurpose` |
| alerts, "paramedics updated this record" | nothing new: subscribe to the stream and derive, exactly as the reducer derives today |

access control (section 7) is the gate on all of these: the attribute rules (role, org,
incident, destination, time window) decide whether a route answers at all. that is why
ARCHITECTURE.md says do milestone 4 before more UI; the dashboard is now the reason to do it.

## how the dashboard changes (and how it doesn't)

the components stay. `useIncident()` / `useIncidentDispatch()` keep their signatures. only
the provider's insides change, in three steps:

1. **read-only, one afternoon.** add a vite proxy (`/api` → `http://localhost:8787`), a
   typed client (`src/api/client.ts`, responses parsed with the zod schemas), and a
   `mapNoteToEpcr()` that turns `NoteSections` into the `EpcrField` values the review page
   already renders (`patient.name` → surname / first name, `vitals[0].hr` → pulse,
   `sample.allergies` → allergies, `spans` → `evidence`, `flags` → `flagged`). point the
   record modal's transcript at `session.transcript`. the dashboard now shows the last drill's
   real ePCR instead of the fixture, with the same screens.
2. **live.** replace the localStorage sharing with `EventSource("/api/dev/stream")`:
   on "changed", refetch the incident. two browsers (alvin, rick) now see one record for real.
   the bell and the "updated" banner already derive from state, so they light up unchanged.
3. **writes.** each reducer case becomes a request to the routes above; the reducer keeps
   running as the optimistic copy so the UI never waits. provenance (who, when) is what the
   server already records; the dashboard stops making up `at` times from the wall clock.

keep a `VITE_DEMO=1` mode that leaves the in-browser story in place. it is what the capstone
demo runs on when there is no pi and no api in the room.

## where things live

- `packages/web/src/api/` (new): `client.ts`, `mapNote.ts`, `stream.ts`.
- `packages/web/src/incident/IncidentContext.tsx`: swap storage for the client; nothing else
  in `features/` changes.
- `packages/api/src/`: `auth.ts`, `incidents.ts`, `notes.ts`, `grants.ts`, `handoff.ts`, each
  a hono router mounted in `app.ts`, each calling the audit log the way the asset routes do.
- `packages/schema`: add `NoteRevision { noteId, version, sections, provenance, by, at }`
  and `HandoffToken { token, grantId, expiresAt, openedAt?, receivedAt? }`. `AccessGrant`
  already has `expiresAt`.
- serving: in production `app.ts` serves `packages/web/dist` with hono's `serveStatic` at
  `/app`, the drills dashboard stays at `/`. in dev, vite on 5173 proxies to 8787.
- ci: `pnpm -r run build` already includes `web`; add `pnpm --filter @nightingale/web lint`.

## field mapping, so nobody guesses

| dashboard ePCR key | `NoteSections` path |
|--------------------|---------------------|
| surname, firstName, patientName, dob, sex | `patient.name`, `patient.dob`, `patient.sex` |
| chiefComplaint | `chiefComplaint` |
| incidentHistory | `narrative` (plus `timeline`) |
| timeOfOccurrence | `incident.times.callReceived` / `scene` |
| pulse, resp, bp, spo2 | `vitals[n].hr`, `.rr`, `.bp`, `.spo2` (latest set) |
| levelOfConsciousness | `vitals[n].loc`, `conditionObserved` |
| medications, allergies, pastHistory, lastOralIntake | `sample.medications`, `.allergies`, `.pastHistory`, `.lastOralIntake` |
| headStrike, painLocation | `physicalExam`, `opqrst.radiation` |
| occurrenceLocation, dispatchNumber, callNumber | `incident.location`, `incident.dispatchReason` |
| unit, crew, fdOfficer | `incident.unitsOnScene` |
| handoffTo, destination | `transport.handoffTo`, `transport.destination` |
| careAndResponse | `interventionsPerformed`, `interventions[]` |
| files tab | `photoNotes[]` + assets with `photoPurpose` |
| hazards line on the handoff page | `hazards` |
| family contact, belongings (handoff "other") | `familyContact`, `belongings` |

evidence per field = `spans.find(s => s.field === path).transcriptSegmentIds`, which is
exactly what the transcript highlight on step 4 expects.

## order of work

1. proxy + client + `mapNoteToEpcr` + transcript from the session (read-only). one day.
2. device sign-in and the actor on audit events. two days, mostly tests (section 13).
3. approve, grants, accept, revisions, handoff token and receipt. three to four days with
   the access-control test matrix.
4. SSE for record changes; retire localStorage sharing except in demo mode. one day.
5. serve `web/dist` from hono; one docker-compose `up` runs everything.
