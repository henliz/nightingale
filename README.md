# nightingale

a shared record that crosses custody, so what a firefighter captures on scene doesn't get
lost by the time a patient reaches the hospital. fire, then paramedics, then hospital ed,
each one handed a clean note instead of whatever used to get lost in the shuffle.

capstone prototype (GBDA 402, "lost in handoff"). scripted drills, fictional patients, no
real patient info goes through this thing, ever. This branch includes MVP authentication,
authorization, audit logging, upload limits, and device transport protections, but it is
still not approved for real patient data or a claim of PHIPA/MFIPPA compliance.

- the why behind every design rule: [ARCHITECTURE.md](./ARCHITECTURE.md)
- the whole thing in plain english, for non-coders: [HOW-NIGHTINGALE-WORKS.txt](./HOW-NIGHTINGALE-WORKS.txt)

## the 30 second version

a responder wears a little raspberry pi ("nightingale") with a mic, a camera and two
buttons. it records the call and sends the audio + photos to a laptop. the laptop turns
that into a transcript (who said what) and a draft ePCR (the patient care report medics
fill in), live, as the call happens. then the dashboard lets fire review it, share it
with the paramedics, and hand it off to the er.

```
 pi on the responder  ──wifi──▶  api on hen's laptop  ──▶  dashboard in the browser
 (records, 2 buttons)            (transcribes, writes         (the nice one, :5173)
                                  the ePCR, saves drills/)    (the ugly dev one, :8787)
```

## there are two dashboards

**the real one** (`packages/web`, http://localhost:5173). light mode, built from the
group's figma. sign in as **alvin** (fire captain) or **rick** (paramedic), any 4 digit
pin. the records list is every real call we've recorded plus one sample call (made-up
patient, from the figma story). open a call to see the ePCR split by role, the
transcript, photos, flags, the share + handoff flow. **new call** on the home page starts
a fresh call the pi records into, and the transcript fills in word by word while you talk.

**the ugly one** (`packages/api`, http://localhost:8787). dark mode, one page, intended
for local fictional drills. In secured server mode its data routes require scoped API
credentials; use it when something's broken and you want to see why.

both read the same data from the same api, so they always agree.

## just want to look? (groupmates start here)

you can see every recorded call on your own laptop, no pi, no docker, no api keys.

what you're installing and why:

| thing | why | how |
| --- | --- | --- |
| node 22+ | runs the api and the dashboard | [nodejs.org](https://nodejs.org) or `brew install node` |
| pnpm | installs the monorepo's packages (like npm, but for a repo with lots of packages) | `corepack enable` (comes with node) |

```
git clone https://github.com/henliz/nightingale.git
cd nightingale
pnpm install

# terminal 1: the api, with the saved calls from drills/
pnpm --filter @nightingale/api dev:memory

# terminal 2: the real dashboard
pnpm --filter @nightingale/web dev
```

then open http://localhost:5173 (real one) or http://localhost:8787 (ugly one).

good to know:
- you'll see the transcripts and ePCRs, but **not the photos or audio**. those stay on
  hen's laptop (gitignored), so photo thumbnails show up empty
- without api keys nothing new gets transcribed, you're just reading what's saved. that's
  the point, you can't break anything
- anything you click through (reviewing, sharing, accepting) lives in that browser tab
  only. close the tab and it's back to clean

### watching a call live from your own laptop

if you're on the **same wifi** as hen's laptop while she's running a drill, skip the api
and point your dashboard at hers:

```
NIGHTINGALE_API_URL=http://Henriettas-MacBook-Air.local:8787 pnpm --filter @nightingale/web dev
```

open http://localhost:5173 and you'll see the call come in as it happens, same as on her
screen. or just open http://Henriettas-MacBook-Air.local:8787 for the ugly one, no
install needed. (uni / venue wifi sometimes blocks laptops from seeing each other, a phone
hotspot fixes that.)

## who receives the pi?

**only hen's laptop.** when the pi gets set up (`./device/deploy.sh`), the address of the
laptop running the script gets written onto the pi, and that's the only place it ever
sends to. your laptop running the api doesn't change that, the pi doesn't know it exists.
setting it up from another laptop would need ssh access to the pi (hen's login), so don't.

so: one receiver, everyone else can watch (see above). The local memory demo retains
fictional-drill compatibility; the production-style server requires API keys and the
device requires HTTPS plus a per-device bearer token. The browser demo still needs a
real login/token exchange before it could be used outside this school prototype.

## running the whole thing (hen's laptop, with the pi)

on top of node + pnpm:

| thing | why |
| --- | --- |
| docker, via [colima](https://github.com/abiosoft/colima) on a mac | runs postgres + the "sealed vault" (where raw audio and photos go, an s3 style store) |
| `.env` at the repo root with `GEMINI_API_KEY` (or `OPENAI_API_KEY`) | real transcription, speaker labels, the ePCR, photo captions. not committed, ask hen |
| rust + [cross](https://github.com/cross-rs/cross) | only to rebuild the pi's code, see [`device/README.md`](./device/README.md) |

```
colima start                              # docker on the mac
pnpm run dev:services                     # postgres + vault. give the vault ~30s or the api crashes on start
pnpm --filter @nightingale/api dev        # :8787, the api + the ugly dashboard
pnpm --filter @nightingale/web dev        # :5173, the real dashboard
```

then:
1. turn the pi on (power/record button). recording starts on boot
2. the real dashboard's home page should say **nightingale is on, last heard Xs ago**. if
   it says "no device heard from yet", the pi can't reach the laptop (same wifi?)
3. **new call**, then talk. words show up greyed out right away, speaker labels and the
   ePCR land ~15-30s later as each 15s chunk saves
4. power/record again to stop. the pi saves, uploads and powers off. photo button takes a
   photo, only while recording

pushing new pi code: `./device/deploy.sh` (needs colima running, first build ~5 min). only
needed when something in `device/` changes, the api and dashboard reload on their own.

## the saved calls (`drills/`)

every call the api hears gets its own folder: `transcript.md`, `epcr.md` (both readable
on github), `session.json`, plus audio + photos that stay local. what's committed:

- **case 1 · cardiac arrest (bbq)**, **case 2 · shellfish allergy**, **case 3 · dirt bike
  femur**: the oct 19 field tests at maryhill
- the oct 27 read-along (low blood sugar at a community centre gym), shows up as
  "confusion, headache"

only commit real test calls. the pi left on in silence, old queued uploads from an earlier
boot, empty new-call clicks: the dashboard hides those, but they still get a folder, so
check before `git add drills`. if a case ever gets messed up, `git checkout drills/` puts
it back.

## checks

```
pnpm run typecheck
pnpm --filter @nightingale/web lint
pnpm run test
node packages/api/scripts/grade-cases.mjs gemini-2.5-flash:none   # re-grades the ePCR on the saved calls, needs a gemini key
```

ci runs the first three plus the device's `cargo fmt / clippy / test` on every push.

## how it works, a bit deeper

**1. capture, the device** (`device/`). the pi records 15s audio chunks and button photos
into an on-disk queue, and uploads them in parts so bad wifi on scene never loses a
clip. nothing gets deleted off the pi until the laptop confirms it has it. it also
streams the mic live so the transcript can show words as they're said.

**2. transcribing + writing the note** (`packages/pipeline`). the raw audio lands in the
vault, gets transcribed with speaker labels (Person 1, 2, ...), then condensed into a
structured draft ePCR. the instructions for that live in `real-adapters.ts`
(`CONDENSE_PROMPT_VERSION`, epcr-v10 right now): never invent a side, a time, a name or a
number, flag anything uncertain so it's outlined red for the responder to check.

**3. review, share, hand off** (`packages/web` + `packages/api`). fire reviews and
confirms the flagged fields, shares the record with the paramedics, paramedics accept and
verify, the er gets a one-time handoff link. every view and edit goes through a tamper
evident audit log (`packages/audit`).

## status

done: chunked/resumable ingest + the rust upload client, scoped MVP API access control,
hash-chained audit logging, the real pipeline (gemini or openai), the pi's two button
capture daemon, both dashboards, live transcription, upload limits, and device bearer
authentication/HTTPS checks. not done: production identity, retention, breach response,
and a watchdog on the pi. See [SECURITY-DEMO.md](./SECURITY-DEMO.md),
[THREAT-MODEL.md](./THREAT-MODEL.md), and [PRIVACY-SECURITY-READINESS.md](./PRIVACY-SECURITY-READINESS.md).

## layout

- `device/`: rust capture daemon for the pi (buttons, queue, uploads, live mic stream)
- `packages/api`: the ingest api, live transcription, the ugly dashboard at `/`, the
  `/dev/*` routes the real dashboard reads
- `packages/web`: the real dashboard (vite + react), fire, paramedic and er handoff views
- `packages/pipeline`: transcribe -> speaker labels -> condense into the ePCR, real + fake adapters
- `packages/schema`: zod schemas, single source of truth for the data model
- `packages/audit`: the hash chained log
- `packages/fixtures`: two fictional scenarios the tests run against
- `packages/retention`: placeholder, its README says which milestone builds it
- `drills/`: the saved calls
