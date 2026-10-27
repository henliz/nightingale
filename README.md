# nightingale

a shared record that crosses custody, so what a firefighter captures on scene doesn't get
lost by the time a patient reaches the hospital. fire, then paramedics, then hospital ed,
each one handed a clean note instead of whatever used to get lost in the shuffle.

capstone prototype only right now. scripted drills, fictional patients, no real patient
info goes through this thing. full design doc, the why behind every rule, is in
[ARCHITECTURE.md](./ARCHITECTURE.md), this file is just the quickstart.

## how it works, start here

three things happen, in order, and each one lives in a different part of this repo.

**1. capture, the device.** a responder presses a button. maybe it's the raspberry pi
wearable (`device/`), maybe it's a phone/tablet app, maybe it's a paper form with photos,
whichever's on hand in the moment. none of these are smart, they just record a short clip
and send the raw bytes off in chunks, so a bad wifi connection on scene doesn't lose the
whole clip. see [`device/README.md`](./device/README.md).

**2. transcribing + writing the note, the pipeline.** the raw audio lands in a sealed
vault nobody can casually browse, then runs through three steps: transcribe it (speech to
text), diarize it (flag any voice that isn't the responder or the patient, like a
bystander, so it gets reviewed before anything is shared), then condense it into a short
structured note. nothing gets shared yet at this point, a human reviews and approves it
first. see [`packages/pipeline/README.md`](./packages/pipeline/README.md).

**3. the final destination, access + dashboard.** once a responder approves the note, it
(never the raw audio) goes out to whoever's actually cleared to see it: fire sees its own
captures, paramedics see the approved note, the hospital ed only sees it once the patient
is confirmed as arriving there, nowhere else. every view, edit, and approval gets logged
in a tamper evident audit trail. the api is `packages/api`, the dashboard is `packages/web`
(fire + paramedic views, the ePCR split by role, the er handoff page). access control isn't
built yet, so the dashboard only ever shows the fictional drills. see
[`packages/api/README.md`](./packages/api/README.md),
[`packages/web/README.md`](./packages/web/README.md) and
[`packages/audit/README.md`](./packages/audit/README.md).

there's also a plain english version of all this for non-coders in
[HOW-NIGHTINGALE-WORKS.txt](./HOW-NIGHTINGALE-WORKS.txt).

## quickstart

```
pnpm install
pnpm run dev:services   # postgres + the s3-compatible vault (seaweedfs) via docker compose
pnpm run typecheck
pnpm run test
```

## running the demo

```
colima start                              # docker on the mac
pnpm run dev:services                     # postgres + vault, give the vault ~30s
pnpm --filter @nightingale/api dev        # http://localhost:8787, the old dark dev dashboard
pnpm --filter @nightingale/web dev        # http://localhost:5173, the real dashboard
```

the api needs `OPENAI_API_KEY` (or `GEMINI_API_KEY`) in `.env` at the repo root for
transcribing + writing the ePCR. no docker? `pnpm --filter @nightingale/api dev:memory`
runs it all in memory instead.

- the records list is the 3 maryhill drills in `drills/` (cardiac arrest, shellfish
  allergy, dirt bike femur) plus the sample call. they're committed, so
  `git checkout drills/` puts them back if anything ever touches them
- anything you click through or edit in the dashboard lives in that browser tab only,
  close it and you're back to clean (`/reset` only clears the call on screen)
- **new call** on the home page starts a fresh call: whatever the pi records from then on
  lands there, live words show up in the transcript as they're said, the ePCR fills in
  every chunk. the saved cases aren't touched
- the home page also says if the live feed is up and when the pi was last heard from
  (it sends a heartbeat every 30s)
- pi side: `ssh henliz@nightingale.local`, deploy with `./device/deploy.sh`. the pi
  finds the laptop at `Henriettas-MacBook-Air.local:8787`, so both have to be on the
  same wifi

device stuff lives in `device/`, separate cargo toolchain:

```
cd device
cargo build
cargo test
```

## status

done: scaffold, chunked/resumable ingest api + rust upload client, hash chained audit log
on every api route, the pipeline with real providers (openai or gemini transcribe, speaker
labels, condense into an ePCR, photo captions), the pi's two button capture daemon, the dev
dashboard and the web dashboard. not done: access control (so no real patient data, ever),
retention, a watchdog on the pi. see ARCHITECTURE.md section 12 for the full build order.

## layout

- `packages/schema`: zod schemas + json schema export, single source of truth for the data model
- `packages/fixtures`: two fictional drill scenarios, everything else tests against these
- `packages/api`: the ingest api (device/app -> vault), live transcription, the dev
  dashboard at `/`, and the `/dev/*` routes the web dashboard reads
- `packages/pipeline`: transcribe -> diarize -> condense, real (openai/gemini) + fake adapters
- `packages/audit`: the hash chained log, wired into every api route
- `packages/web`: the dashboard (vite + react), fire, paramedic and er handoff views
- `packages/retention`: placeholder, its README says which milestone builds it
- `device/`: rust capture daemon for the pi, two button state machine, on-disk queue, uploads
- `drills/`: the saved cases, one folder each (audio, photos, transcript, ePCR)
