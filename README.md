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
in a tamper evident audit trail. right now that's `packages/api`, the dashboard ui itself
(`packages/web`) isn't built yet. see [`packages/api/README.md`](./packages/api/README.md)
and [`packages/audit/README.md`](./packages/audit/README.md).

## quickstart

```
pnpm install
pnpm run dev:services   # postgres + minio via docker compose
pnpm run typecheck
pnpm run test
```

device stuff lives in `device/`, separate cargo toolchain:

```
cd device
cargo build
cargo test
```

## status

milestones 0 to 3 done: scaffold, chunked/resumable ingest api + rust upload client, hash
chained audit log wired into every api route, fake transcribe/diarize/condense pipeline
tested against the fixtures. next up is access control. see ARCHITECTURE.md section 12
for the full build order and what's still ahead.

## layout

- `packages/schema`: zod schemas + json schema export, single source of truth for the data model
- `packages/fixtures`: two fictional drill scenarios, everything else tests against these
- `packages/api`: the ingest api (device/app -> vault) + where access control lands next
- `packages/pipeline`: transcribe -> diarize -> condense, fake adapters for now
- `packages/audit`: the hash chained log, wired into every api route
- `packages/retention`, `packages/web`: placeholders, each has a README saying which milestone builds it
- `device/`: rust capture daemon for the pi, upload client done, capture state machine not yet
