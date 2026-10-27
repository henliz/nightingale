# @nightingale/web

the dashboard ui (ARCHITECTURE.md section 9), built from alita's figma mvp flow
(SEC04-GROUP05-CAPSTONE, "Alita- Firefighter dashboard MVP" + "Alita- Paramedic dashboard MVP").
vite + react 19 + react router 7, typescript strict, css modules on top of the figma
"clear blue" tokens in `src/styles/tokens.css`. no tailwind. the react compiler is on.

prototype only: fictional drills and one sample call, no real patient ever.

## run it

```
pnpm install
pnpm --filter @nightingale/web dev      # http://localhost:5173
pnpm --filter @nightingale/web lint
pnpm --filter @nightingale/web typecheck
pnpm --filter @nightingale/web build    # tsc -b && vite build
```

## where the data comes from

the dashboard reads real calls from `packages/api` (`GET /dev/sessions`): each call's condensed
ePCR (`DraftNote`), the speaker-labelled transcript, and scene photos. start the api first
(`pnpm --filter @nightingale/api dev` with docker, or `pnpm --filter @nightingale/api dev:memory`
without; port 8787, vite proxies `/api` there), then just open `localhost:5173`. the
server-sent event stream refreshes whenever the api says something changed.

the records list is the named cases from `drills/` plus the sample call (the original figma
story with its made-up patient). the current call card follows the newest call, so a fresh one
from the pi shows up there. **new call** on the home page starts one on purpose (same as the
dev dashboard's "new session"), and the home page shows whether the live feed is up and when
the pi was last heard from. words being said right now show up greyed out at the bottom of
the transcript until the saved line lands. each call keeps its own story (shared, accepted, verified…) in the
browser until milestones 4 and 5 add those routes; see `docs/integration-plan.md`.

`src/api/`: `client.ts` (fetch + zod parse against `@nightingale/schema`), `mapNote.ts`
(`NoteSections` → record and ePCR fields, `spans` → supporting speech, `flags` → red fields),
`LiveSourceContext.tsx` (which session, loading state, the stream).

## the click path

sign in on the department device (any 4 digit pin), then:

- **alvin, fire captain** (`/fire`): crew en route → review note → finish review → check every
  field against the transcript (`/fire/record`) → save → share link → print report
- **rick, paramedic** (`/paramedic`): review note → accept record → view note → open record
  → verify fields (`/paramedic/record`) → save → reveal qr code
- **er triage nurse** (`/handoff/<token>`, no account): confirm receipt → mark as read

the record is one shared story. sign out (click your name) and sign in as the other
person in the same browser and you see the same record from their side: alvin's "shared"
banner turns to "accepted" when rick accepts, rick's corrections show up on alvin's queue,
triage's receipt lights the last step on both dashboards. `/reset` starts over.

## layout

- `src/app/`: router, role gate, providers
- `src/session/`: who is signed in (sessionStorage)
- `src/incident/`: the shared record. `types.ts` has the stage path, `reducer.ts` only
  ever moves forward, `selectors.ts` resolves ePCR fields through the responders' reviews.
  persisted to sessionStorage so it survives reloads and sign-ins, but not closing the tab.
- `src/data/`: the fictional call, patient record, ePCR fields, transcript, handoff summary
- `src/components/`: ui primitives (button, chip, card, alert, dialog, tabs, field) and the
  app shell. the dialog is a native `<dialog>`.
- `src/features/`: one folder per screen family: auth, home (shared queue layout), fire,
  paramedic, record (patient record modal), epcr (field by field review), share, print,
  handoff
- `src/assets/figma/`: icons exported from the figma file, used as-is

every ePCR value only changes through the review dialog, so each field keeps who confirmed
it and when (ARCHITECTURE.md section 2). flagged fields stay flagged until a person looks.

## still to do

- hook the dashboard to `@nightingale/api` instead of the in-browser store
- the transcript tab in the record modal and the "overview" toggle on the review page are
  filled from the fixture, not from a real capture
- clinical / fire sheet / service tabs carry a small field set; the on-scene sheet has more
