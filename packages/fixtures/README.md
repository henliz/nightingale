# @nightingale/fixtures

fictional scenarios for tests and demos. **no real patient information, scripted patients only** (ARCHITECTURE.md, scope).

each scenario is a full slice through the data model: `Org`s, an `Incident`, a `Capture`, a scripted `Transcript` with about 10 planted facts (matching the drill protocol in ARCHITECTURE.md section 4/8), a hand written `DraftNote` with spans and flags, and an `ApprovedNote`. so pipeline, access control, and UI work all have something real to run against before any real transcriber or LLM is wired in.

audio/photo bytes aren't included in v0, `Asset.vaultKey` fields just point at placeholder keys. the scripted *text* of the transcript is the fixture, recording the actual scripted audio clips is a later milestone (ARCHITECTURE.md section 8, evaluation harness).

- `src/scenarios/fall-with-fracture.ts`: elderly fictional patient, witnessed fall, capable, a bystander present (tests non responder speech flagging)
- `src/scenarios/mva-single-vehicle.ts`: fictional single vehicle collision, patient incapable/unconscious (tests capacity + decision maker fields, hazard notes, destination not yet confirmed state)
