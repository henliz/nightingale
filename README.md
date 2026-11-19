# nightingale

a shared record that follows the patient. what a firefighter captures on scene gets handed
to the paramedics, then to the hospital, instead of getting lost along the way.

capstone prototype (GBDA 402, "lost in handoff"). **scripted drills and made-up patients
only. never put real patient info into this.** there's no login protection yet, so that's
the rule, not a suggestion.

never coded before? you're in the right place. start with **step 1** below, you don't need
to understand any of the code to look at the calls we've recorded.

- the whole system in plain english: [HOW-NIGHTINGALE-WORKS.txt](./HOW-NIGHTINGALE-WORKS.txt)
- the why behind every design rule (more technical): [ARCHITECTURE.md](./ARCHITECTURE.md)

## what it does, in 30 seconds

a responder wears a little device (a raspberry pi, named "nightingale") with a mic, a
camera and two buttons. it records the call and sends it over wifi to hen's laptop. the
laptop turns the audio into a written transcript and a draft patient report, live, while
the call is happening. then a website (the "dashboard") lets fire review it, share it with
the paramedics, and hand it off to the er.

```
 device on the responder  ──wifi──▶  hen's laptop  ──▶  dashboard in your browser
```

---

## how to look at the recorded calls on your own laptop

you don't need the device, special accounts or any passwords for this. you'll be reading
calls we already recorded, and nothing you click can break anything.

these steps are for a **mac**. it takes about 10 minutes the first time, and 1 minute
every time after.

### step 1: install node (one time only)

node is the free program that runs nightingale on your laptop.

1. go to [nodejs.org](https://nodejs.org) and click the big **download** button (the "LTS"
   one)
2. open the file you downloaded and click through the installer like any other app

### step 2: open the terminal

the terminal is an app where you type commands instead of clicking. it's already on your
mac.

1. press **cmd + space**, type `terminal`, press **enter**
2. a window with text opens. this is where you'll paste the commands below

how to run a command: copy the line, paste it into the terminal (**cmd + v**), press
**enter**, and wait until it finishes (you'll see a new line ending in `%` or `$`).

### step 3: turn on pnpm (one time only)

pnpm is a helper that downloads the pieces nightingale needs. it comes with node, you just
switch it on:

```
corepack enable pnpm
```

if it says **permission denied**, run this instead. it'll ask for your mac password (the
one you log in with). the screen won't show anything while you type it, that's normal,
just type it and press enter:

```
sudo corepack enable pnpm
```

### step 4: download nightingale (one time only)

1. on this github page, click the green **code** button, then **download ZIP**
2. open the zip (it's in your downloads folder). you'll get a folder called
   `nightingale-main`
3. drag that folder onto your **desktop**

then, in the terminal, go into that folder:

```
cd ~/Desktop/nightingale-main
```

### step 5: install the pieces (one time only)

```
pnpm install
```

this takes a minute or two and prints a lot of text. that's fine. if it asks
"do you want to download pnpm?", type `y` and press enter.

### step 6: start it (every time)

nightingale has two parts, and each one needs its own terminal window that stays open.

**window 1, the part that serves the saved calls.** paste this and leave the window open:

```
pnpm --filter @nightingale/api dev:memory
```

**window 2, the website.** open a second terminal window (**cmd + n** while the terminal
is open), then paste these two lines:

```
cd ~/Desktop/nightingale-main
pnpm --filter @nightingale/web dev
```

### step 7: open it in your browser

go to **http://localhost:5173** (chrome, safari, whatever you like).

- sign in as **alvin** (fire captain) or **rick** (paramedic). any 4 numbers work as the pin
- the records list shows every call we recorded, plus one sample call (a made-up patient
  from our figma story)
- click a call to see the patient report, the transcript, the flags, and the share +
  handoff flow

### step 8: when you're done

click into each terminal window and press **ctrl + c** to stop it, then close the windows.

next time you only need step 2, the `cd` line from step 4, then steps 6 and 7.

### good to know

- **photos and audio won't show up.** those only live on hen's laptop, so photo boxes are
  empty. the transcripts and reports are all there
- **nothing new gets transcribed** on your laptop. you're only reading what's saved
- **anything you click** (reviewing, sharing, accepting) only lives in that browser tab.
  close the tab and everything is back to how it started

### something went wrong?

| what you see | what to do |
| --- | --- |
| `command not found: pnpm` | do step 3 again, then close and reopen the terminal |
| `command not found: node` | node isn't installed, do step 1 again |
| `no such file or directory` after `cd` | the folder isn't on your desktop or has a different name. check it's called `nightingale-main` and is on the desktop |
| the website says it can't connect, or shows no calls | window 1 isn't running. check it's still open and didn't print an error |
| `port 5173 is in use` | it's already running in another window. just open http://localhost:5173 |
| anything else | screenshot the terminal and send it to hen |

there's also a second, uglier page at **http://localhost:8787** (dark mode, no login).
that's the developer view, with the raw data and every log message. you can ignore it
unless hen asks you to look at it.

---

## watching a live drill from your laptop

if you're on the **same wifi** as hen while she's running a drill, open this in your
browser, no install needed:

**http://Henriettas-MacBook-Air.local:8787**

want the nice dashboard instead? do steps 1 to 5 above, then skip window 1 and run this in
window 2:

```
NIGHTINGALE_API_URL=http://Henriettas-MacBook-Air.local:8787 pnpm --filter @nightingale/web dev
```

then open http://localhost:5173 and calls show up as they happen. (uni or venue wifi
sometimes stops laptops from seeing each other. a phone hotspot fixes that.)

## who receives the device's recordings?

**only hen's laptop.** when the device gets set up, hen's laptop address is written onto
it, and that's the only place it ever sends to. running nightingale on your laptop doesn't
change that. so: one laptop receives, everyone else can watch (see above).

---

## for hen: running the whole thing with the device

on top of node + pnpm you need:

| thing | why |
| --- | --- |
| docker, via [colima](https://github.com/abiosoft/colima) | runs postgres + the "sealed vault" (where raw audio and photos go) |
| `.env` at the repo root with `GEMINI_API_KEY` (or `OPENAI_API_KEY`) | real transcription, speaker labels, the ePCR, photo captions. not committed |
| rust + [cross](https://github.com/cross-rs/cross) | only to rebuild the device's code, see [`device/README.md`](./device/README.md) |

```
colima start                              # docker on the mac
pnpm run dev:services                     # postgres + vault. give the vault ~30s or the api crashes on start
pnpm --filter @nightingale/api dev        # :8787, the api + the dev dashboard
pnpm --filter @nightingale/web dev        # :5173, the real dashboard
```

then:
1. turn the device on (power/record button). recording starts on boot
2. the dashboard home page should say **nightingale is on, last heard Xs ago**. "no device
   heard from yet" means it can't reach the laptop (same wifi?)
3. **new call**, then talk. words show up greyed out right away, speaker labels and the
   ePCR land ~15-30s later as each 15s chunk saves
4. power/record again to stop. the device saves, uploads and powers off. the photo button
   only works while recording

pushing new device code: `./device/deploy.sh` (needs colima running, first build ~5 min).
only needed when something in `device/` changes.

### the saved calls (`drills/`)

every call gets its own folder: `transcript.md`, `epcr.md` (both readable on github),
`session.json`, plus audio + photos that stay local. committed so far:

- **case 1 · cardiac arrest (bbq)**, **case 2 · shellfish allergy**, **case 3 · dirt bike
  femur**: the oct 19 field tests at maryhill
- the oct 27 read-along (low blood sugar at a community centre gym), shows up as
  "confusion, headache"

only commit real test calls. silent recordings, old queued uploads and empty new-call
clicks still get a folder, so check before `git add drills`. `git checkout drills/` puts a
messed-up case back.

### checks

```
pnpm run typecheck
pnpm --filter @nightingale/web lint
pnpm run test
node packages/api/scripts/grade-cases.mjs gemini-2.5-flash:none   # re-grades the ePCR on the saved calls, needs a gemini key
```

ci runs the first three plus the device's `cargo fmt / clippy / test` on every push.

### status

done: resumable uploads + the rust upload client, the tamper-evident audit log, the real
pipeline (gemini or openai), the device's two-button capture, both dashboards, live
transcription. not done: real logins, retention, a watchdog on the device.
ARCHITECTURE.md section 12 has the build order.

the `branding` branch also has cindy's MVP security work (scoped api keys, upload limits,
device https + per-device tokens), written up in `SECURITY-DEMO.md`, `THREAT-MODEL.md` and
`PRIVACY-SECURITY-READINESS.md` on that branch. still not approved for real patient data.

### layout

- `device/`: rust capture daemon for the pi (buttons, queue, uploads, live mic stream)
- `packages/api`: the ingest api, live transcription, the dev dashboard at `/`, the
  `/dev/*` routes the real dashboard reads
- `packages/web`: the real dashboard (vite + react), fire, paramedic and er handoff views
- `packages/pipeline`: transcribe -> speaker labels -> condense into the ePCR
- `packages/schema`: zod schemas, the data model
- `packages/audit`: the hash chained log
- `packages/fixtures`: two fictional scenarios the tests run against
- `packages/retention`: placeholder
- `drills/`: the saved calls
