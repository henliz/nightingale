# Nightingale / "Lost in Handoff": System Architecture (v0.2)

**Status:** draft for the prototype build, read by the capstone team and used to guide the monorepo build. v0.2 (17 Oct 2026) adds the device service lifecycle, dev log streaming, the live transcript page, and the transcription research (sections 5, 8, 9, 12).
**Scope:** capstone prototype (MVP package Nov 6), designed so a small trial after December is possible. The prototype uses **scripted drills with fictional patients only. No real patient information goes through it.**
**Legal note:** the privacy rules below come from the team's Oct 8 design research. They are design assumptions, not legal advice. Items marked **[LAWYER]** must be confirmed before any real-world trial.

---

## 1. What we are building

A shared record that legitimately crosses custody (fire, then paramedics, then hospital ED).

1. A responder captures scene information by a **deliberate gesture** (button press) as short audio and/or photos.
2. Audio is transcribed and condensed by AI into a **condensed note**.
3. The source material (raw audio, photos, transcript) goes into a **sealed vault**. It is retained or destroyed under a rule set by the custodian. It is never shown on the dashboard.
4. The responder **reviews and approves** the note.
5. Only the reviewed note and approved photos are shared through a **tiered-access dashboard**.

The Pi wearable is **one capture mode among several** (also: phone/tablet app, and a form with photos). The architecture must not assume the wearable. Anything that can produce a `Capture` can feed the same pipeline.

## 2. Design rules (non-negotiable; enforce in code and tests)

**Capture**
- Button-press only. **No always-on listening, no pre-roll buffer.** [LAWYER: is a pre-roll buffer an interception?]
- Hard maximum clip length, auto-stop. Was 90 s (60-120 s); **drill builds use 30 min** (`NIGHTINGALE_MAX_CLIP_SECONDS=1800`, 17 Oct 2026) because 90 s cut every drill off mid-scenario. It is a safety net for a forgotten device; the POWER/RECORD press is the normal stop. [Team/LAWYER: confirm the limit for a real trial.]
- Audible start tone and a visible LED while recording. The responder reads a short verbal notice ("I'm recording for the medical record").
- Camera is a deliberate action. Photos are stored in app-private storage only (no camera roll or gallery).
- No live on-device AI (connectivity is unreliable). The device is **store-and-forward**.

**Sharing and review**
- **Human review before any disclosure.** Nothing is shared until a responder approves it.
- Mark which text is AI-generated and which was edited by the responder. Keep the approval record.
- Pin the model version used for each note. No silent upgrades.

**Retention (not "delete on approval")**
- Raw audio, photos and transcript go to the sealed vault with a **custodian-set retention period**, then are destroyed, unless a **hold** applies.
- Holds suspend destruction: death, police or coroner request, complaint, access request, grievance, litigation.
- Fire-held records have a **one-year minimum retention after use** unless a municipal by-law says otherwise (assumption from MFIPPA Reg. 823). [LAWYER]
- Destruction produces a certificate and an entry in a hash-chained log.

**Access tiers** (see section 7)
- Fire sees only its own captures, for a limited window.
- Paramedics see the reviewed note and approved photos.
- ED sees the reviewed note and photos **only for patients arriving at that hospital, with destination confirmed** (prevents misdirected records; Hamilton 2024 failure mode).
- Raw material is reachable only through the vault, with a second approver and a reason, and every access is logged.

**Photos**
- Faces blurred by default. Crop to clinical need. Tag the purpose (medical vs fire investigation).
- Do not capture health cards. Auto-flag and mask health numbers if detected.
- Minimal capture of home interiors.

**Audio**
- Diarization flags **non-responder, non-patient voices** (bystanders, family) for review and redaction before approval.

**Platform**
- Canadian hosting for storage and processing. No use of customer data for vendor model training.
- Every view, edit, approval, export and deletion is logged (who, role, timestamp, record id).
- **Stay out of medical-device territory:** no triage, diagnosis or treatment suggestions. The note summarizes what was said and seen.
- Incapable or unconscious patients: care proceeds. The note has capacity and decision-maker fields, and notice is given afterward.

## 3. Architecture overview

```
 CAPTURE MODES                         INGEST              PROCESSING (async)
 +----------------------+        +--------------+     +-------------------------------+
 | Pi wearable (Rust)   |--+     |              |     | 1. transcribe (batch)         |
 | Phone/tablet app     |--+---> | Ingest API   |---> | 2. diarize + flag non-responder|
 | Form + photos        |--+     | (chunked,    |     | 3. LLM condense -> DraftNote  |
 +----------------------+        |  resumable)  |     | 4. photo pass: blur, mask     |
        store-and-forward        +------+-------+     +---------------+---------------+
                                        |                             |
                                        v                             v
                                +---------------+            +----------------+
                                | SEALED VAULT  |            | Draft note +   |
                                | raw audio,    |            | flagged items  |
                                | photos,       |            +-------+--------+
                                | transcript    |                    |
                                +-------+-------+                    v
                                        ^                   +----------------+
          second approver + reason      |                   | Responder      |
          (every access logged)         |                   | REVIEW UI      |
                                        |                   | edit/redact/   |
                                        |                   | approve        |
                                +-------+-------+           +-------+--------+
                                | Retention &   |                   | approved
                                | hold service  |                   v
                                +---------------+          +-----------------+
                                                           | Approved note   |
                                                           | + approved photos|
                                                           +--------+--------+
                                                                    v
                                                  +-----------------------------------+
                                                  | TIERED-ACCESS DASHBOARD           |
                                                  | fire / paramedic / ED views       |
                                                  +-----------------------------------+

 Audit log (hash-chained) records every step above.

 DEV ONLY (drills, laptop on the same network):
   device logs + heartbeat --POST /dev/logs--> api --SSE /dev/stream--> dashboard at /
   transcripts, notes, photos as they land --GET /dev/sessions--------> (same page)
```

## 4. Repo layout (pnpm workspaces for TypeScript, a Cargo crate for the device)

```
nightingale/
  ARCHITECTURE.md
  package.json, pnpm-workspace.yaml, tsconfig.base.json
  docker-compose.yml          # postgres + an s3-compatible vault for local dev
  packages/
    schema/       # zod schemas + TS types + exported JSON Schema (single source of truth)
    api/          # ingest + app API (Fastify or Hono), auth, access control
    pipeline/     # workers: transcribe, diarize, condense, photo pass (adapters behind interfaces)
    retention/    # scheduler: retention clocks, holds, destruction certificates
    audit/        # hash-chained audit log library
    web/          # React app: review UI + tiered dashboard
    fixtures/     # fictional scenarios, scripted audio/transcripts, photos for tests and demos
  device/         # Rust capture daemon for the Raspberry Pi (separate Cargo toolchain)
    Cargo.toml
    src/            # main.rs, capture.rs, queue.rs, upload.rs, config.rs
    tests/
    cross/          # cross-compile scripts for aarch64 (build on the PC, not on the Pi)
```

**Language split:** Rust on the Pi, TypeScript everywhere else. The **only contract between them is HTTP**: JSON metadata plus chunked file upload, validated against the JSON Schema exported from `packages/schema`. Keep the device small: capture, queue, upload, nothing else.

**Why Rust for the device (decision, Oct 12):** a long-running battery-powered daemon with 512 MB of RAM benefits from a small footprint, a single static binary, and compile-time checks that catch crashes before they happen in the field. It is also a deliberate learning goal for the project owner. **Known risks, accepted:** it is her first Rust project and first hardware project at the same time, and Rust camera support is thin. Mitigation: capture shells out to the maintained Raspberry Pi tools (`rpicam-still`, `arecord`) instead of using camera crates (see section 5). **Fallback:** because the contract is HTTP only, the device can be rewritten in Python in a few days if the Rust toolchain eats the schedule. Decide at the first checkpoint (section 12, milestone 7a).

## 5. Device (Raspberry Pi Zero 2 W, "nightingale")

Hardware (v0): Pi Zero 2 W (Raspberry Pi OS Lite 64-bit, Debian trixie), a Pi camera module via the CSI cable, a mic (USB or I2S MEMS), one capture button, one status LED, a buzzer or speaker for the start tone, a regulated 5 V power source. Power must allow a **clean shutdown** (UPS HAT or power bank with a low-battery signal). Never wire a raw lithium cell to the Pi. Bluetooth mask-mic input is a v1 option, not v0.

**Buttons (final, 17 Oct 2026; do not change without the team)**
- **POWER/RECORD**, GPIO3 (physical pin 5, ground pin 6). Off: a press wakes the Pi (hardware). Daemon up: recording starts immediately (`record_on_boot`), ready tone, LED on, verbal-notice reminder. Recording: a press stops, saves, writes to the queue (fsync), then `systemctl poweroff`. Reaching `max_clip_seconds` does exactly the same. Presses during boot, SAVING and POWERING OFF are ignored. One press, one action: no short/long press.
- **PHOTO**, GPIO17 (physical pin 11, ground pin 9). While recording: one photo (sharpest of a burst), recording continues. Ignored otherwise.
- Internal pull-ups, active-low, 30 ms debounce. The daemon owns both pins. **Do not enable `dtoverlay=gpio-shutdown`; keep I2C off** (GPIO3 is I2C SDA). The daemon runs as a root systemd service so poweroff needs no password. Shutdown never waits for the network. Never power off with an unsaved recording. Nothing records without the button-initiated boot; no photo without a press.
- Why a power button: the Pi has no switch, the device is worn and must turn off without a laptop, and pulling power can corrupt the SD card and lose queued data.

**Capture state machine** (`device/src/machine.rs`)
```
OFF --press--> BOOTING --daemon up--> RECORDING
RECORDING --press PHOTO--> RECORDING (one photo saved)
RECORDING --press POWER/RECORD or max_clip_seconds--> SAVING --> QUEUED --> POWERING OFF
QUEUED --online (this boot or the next)--> UPLOADING --server ack--> local copy deleted
```
Internally the recording is cut into back-to-back chunks (`chunk_seconds`, default 30) so pieces upload and transcribe while recording continues; the buttons never see this.

**Requirements**
- Local queue on disk, survives power loss and flaky Wi-Fi. Files are removed only after the server acknowledges a complete upload.
- File-level encryption for queued data. Remote wipe is a later item.
- Config: `max_clip_seconds`, `device_id`, API base URL, auth token. Responder identification by PIN or badge (v0: a PIN set per drill).
- Mock mode: record from a WAV file and photo from a test image so all logic runs on a laptop without hardware.
- **Mic and audio quality matter more than the provider.** Close-talk placement (lavalier or I2S MEMS on the collar or shoulder strap, with a foam or fur windscreen) beats any processing. Fixed gain set once per device with `alsamixer`, peaks around -6 to -3 dBFS on a close shout; no aggressive AGC (it pumps background noise in the gaps). Clipping cannot be fixed later; a quiet recording can. Keep 16 kHz mono 16-bit lossless (48 kHz adds nothing, ASR resamples to 16 kHz); FLAC is the next step if upload size matters, before any lossy codec.
- Camera: run `rpicam-still` as a subprocess (`std::process::Command`) and read the file it writes. Audio: run `arecord` as a subprocess (16 kHz, mono, 16-bit WAV, lossless), or use the `cpal` crate (ALSA) if subprocess control proves awkward. **Do not use the old Pi camera crates** (`raspicam-rs` and similar need a 32-bit or legacy camera stack). `rslibcamlite` is an optional later upgrade, not a v0 dependency, because it depends on the rpicam-apps version and must be rebuilt after updates. **No video in v0** (a deliberate decision: photos plus short audio only).
- **Photo capture must handle focus and motion automatically (no hand-set lens position, ever).** The device is worn, so the subject and the wearer both move.
  - Camera (v0, working): **Arducam 16MP IMX519 autofocus** (UC-873 Rev.D) with **Arducam's own libcamera build for trixie**. Raspberry Pi's stock libcamera has no `rpi.af` block for this sensor ("no AF algorithm"); Arducam's packages (libcamera0.7, libcamera-ipa, librpicam-app1, rpicam-apps-core, version `0.7.2+rpt20260819-2` / `1.13.0-2`) add it, and autofocus now locks on the face. Install by hand (do not run Arducam's script, which edits `/boot/config.txt` instead of `/boot/firmware/config.txt`): download the debs from the ArduCAM/Arducam-Pivariety-V4L2-Driver GitHub releases (`libcamera-v0.0.5`, `libcamera-apps-v0.0.5`) and `sudo apt install ./*.deb`. Then `sudo apt-mark hold libcamera0.7 libcamera-ipa librpicam-app1 rpicam-apps-core` so an OS update cannot silently restore the stock build. **Risk:** this depends on Arducam keeping its builds current with Raspberry Pi OS. Fallback if it breaks or Arducam stops updating: Raspberry Pi Camera Module 3 (autofocus in the stock stack, 15-pin, use the 22-to-15 adapter, standard lens).
  - **Keep the camera pipeline warm.** Do not spawn `rpicam-still` cold on each press (5 s default timeout, plus AE and AF warm-up). Run one long-lived `rpicam-vid`/`rpicam-still` process (for example `--timelapse` or `--signal`/`--keypress` capture, or `--mode` with continuous autofocus) while the device is ARMED or IDLE-with-camera-ready, so exposure and focus are already settled when the button is pressed. For the v0 shell proof, `-t 1000` is the minimum.
  - **"Live photo" burst, pick the sharpest.** On a press, take a short burst of about 5 to 8 frames spanning roughly 0.3 s around the press (a rolling buffer for the frames just before it, plus a few after). Score each frame with the variance of the Laplacian (computed on a downscaled greyscale copy; cheap on a Zero 2 W) and **save only the sharpest frame**. Discard the rest immediately, so no extra image data is retained (this is consistent with the data-minimisation rules in section 2). Do not keep or upload video.
  - **Autofocus on capture:** use `--autofocus-mode auto --autofocus-on-capture` (or continuous AF while armed, with a triggered refocus on press). Use `--autofocus-window` biased to the centre of the frame as a starting point; tune on hardware.
  - **Motion and exposure (measured, Oct 2026): do NOT force a fast fixed shutter.** In a normal dim evening room the sensor is already at maximum gain, so brightness scales directly with shutter time. At a forced 1/120 s the photo was far too dark (mean brightness 42 of 255, against 118 for the camera's own choice), and `--ev` did nothing because gain was already maxed. A fixed 1/250 s would be worse, and a short shutter under indoor lights also gives horizontal flicker bands (use multiples of 1/120 s, for example 8333 us, on 60 Hz mains). Instead: let auto-exposure choose, with a ceiling of about 1/30 s, and handle movement by the burst-and-pick-sharpest step plus the quality gate. Smaller files, brighter and sharper photos. Firefighters will shoot in dark and smoky scenes, so low light is a core case, not an edge case; an on-device light is worth considering. Record tuned values in config (`camera.max_shutter_us`, `camera.burst_frames`).
  - **Multi-frame stacking: optional, low-light only (not v0 default).** Prototype `nightingale_stack.py` (burst, reject blurry frames, align with ECC, average, deleting all intermediate frames) was tested on the Zero 2 W: about 16.7 s total for 3 frames at 2328x1748. In a bright room the merged image was slightly softer than the best single frame and noise did not improve. It may help in dim scenes; test before adopting. Stacking only ever saves one finished photo, so it fits the data-minimisation rule if the source frames are deleted at once, but merging on the server would mean uploading several frames, which is a [LAWYER] question.
  - **Burst capture:** `rpicam-still --timelapse` restarts the camera for every frame (about 1.5 s per frame, 3 frames in 4.6 s), too slow and it resets autofocus each time. The daemon must keep one camera pipeline running and pull frames from the stream (for example `rpicam-vid --codec mjpeg` or a libcamera binding), then score and keep the sharpest.
  - **Resolution and tuning (still to test):** compare 2328x1748 (default in tests) with full 4656x3496, and `--sharpness 1.5 --denoise cdn_hq`, against the default, in the same light.
  - **Quality gate:** if the best frame's sharpness score is below a threshold (`camera.min_sharpness`), flag the photo as `low_quality` in its metadata so the responder review step can see it, and do not silently discard it.
  - Lens distortion on this wide lens is expected at close range (selfie distance); scenes at 1 to 3 m look more natural. Software correction is a later option.
- GPIO (button, LED, buzzer): the `rppal` crate.
- Upload: `reqwest` (blocking or async with `tokio`) with `rustls`. Chunked, resumable, with a sha256 per file (`sha2`). Config in a TOML file (`serde`, `toml`).
- Build on the PC and cross-compile to `aarch64-unknown-linux-gnu` (the `cross` tool). Do **not** compile on the Pi (512 MB RAM). Copy the binary over with `scp` and run it as a `systemd` service.
- No transcription or AI on the device.

**Service lifecycle (the device turns itself on and off)**
- The daemon runs as a root `systemd` service (`device/systemd/nightingale-device.service`) and starts on boot, which is the POWER/RECORD wake-up press, so it records straight away (see Buttons above). It never waits for the network.
- On `SIGTERM` (shutdown, `systemctl stop`, low battery): stop any recording at the current frame, finish writing the WAV header, move it into the queue, then exit. Never leave a half-written file outside the queue.
- Low battery: the UPS HAT's low-battery GPIO (or its I2C fuel gauge) triggers `systemctl poweroff`, which flows through the `SIGTERM` path above.
- `WatchdogSec=30` with `sd_notify` pings from the main loop (the `sd-notify` crate), so a hung `arecord` or camera process gets the daemon restarted instead of silently stalling.
- Optional: the hardware watchdog (`dtparam=watchdog=on`, `RuntimeWatchdogSec=15` in `/etc/systemd/system.conf`) reboots the Pi if the whole OS locks up.
- Deploy loop (from the laptop): `device/deploy.sh` runs `cross build --release` (under amd64 emulation on an Apple Silicon Mac, about 5 min cold), copies the binary, env file and unit over, and restarts the service. The Pi finds the laptop by its mDNS name (`<LocalHostName>.local`), so no IP edits when the network changes.

**Logs and telemetry**
- The daemon logs plain `[level] message` lines to stdout (`device/src/devlog.rs`). `journald` keeps it on the Pi (set a size cap: `SystemMaxUse=50M` in `/etc/systemd/journald.conf`). Zero-code way to watch: `ssh henliz@nightingale.local journalctl -fu nightingale-device -o cat`.
- **Dev log shipping:** when `NIGHTINGALE_DEV=1`, a background thread batches log lines and `POST`s them to `/dev/logs` on the laptop API every second or so. If the laptop is unreachable it keeps a bounded ring buffer (about 1000 lines, oldest dropped) and never blocks capture.
- **Heartbeat** every 30 s: state, queue depth and oldest-item age, free disk, CPU temperature, throttling (`vcgencmd get_throttled`), Wi-Fi signal, battery level if the HAT reports it, uptime, binary version.
- **Logs never contain content.** Event names, ids, durations, byte counts, sha256 prefixes and errors only. No transcript text, no audio, no image data, no responder PIN. This keeps logs outside the vault rules.

## 6. Data model (`packages/schema`, zod)

Sketch, turned into zod schemas and exported JSON Schema in `packages/schema`.

```ts
type OrgType = "fire" | "paramedic" | "hospital";

interface Org { id: string; type: OrgType; name: string; retentionDays: number; /* set by custodian */ }

interface Incident {
  id: string;
  createdAt: string;
  orgsInvolved: string[];          // org ids
  destinationHospitalId?: string;  // must be CONFIRMED before ED can see anything
  destinationConfirmed: boolean;
}

interface Capture {
  id: string; incidentId: string; orgId: string; responderId: string; deviceId?: string;
  mode: "wearable" | "app" | "form";
  startedAt: string; durationSec?: number;
  assets: Asset[];                 // audio and photos, stored in the vault
  status: "uploading" | "processing" | "draft" | "approved" | "rejected";
}

interface Asset {
  id: string; captureId: string; kind: "audio" | "photo";
  vaultKey: string; sha256: string; capturedAt: string;
  photoPurpose?: "medical" | "fire_investigation";
  facesBlurred?: boolean; healthNumberFlagged?: boolean;
}

interface Transcript {
  id: string; captureId: string; provider: string; modelVersion: string;
  segments: { start: number; end: number; speaker: string; text: string; confidence: number;
              nonResponder?: boolean /* flagged for redaction review */ }[];
}

interface DraftNote {
  id: string; captureId: string; modelVersion: string; promptVersion: string;
  sections: NoteSections;
  spans: { field: string; transcriptSegmentIds: string[] }[];  // every claim points at its source
  flags: { type: "low_confidence" | "non_responder_speech" | "health_number" | "unsupported_claim";
           ref: string; note?: string }[];
}

interface NoteSections {
  mechanismOrComplaint?: string;
  timeline?: string;
  patient?: { name?: string; age?: string; capacity?: "capable" | "incapable" | "unknown";
              decisionMaker?: string };
  medsAndAllergiesMentioned?: string[];
  hazards?: string;
  bystanderStatements?: string;
  belongings?: string;
  familyContact?: string;
  photoNotes?: { assetId: string; caption: string }[];
}

interface ApprovedNote {
  id: string; draftNoteId: string; incidentId: string;
  sections: NoteSections;           // after responder edits
  provenance: { field: string; source: "ai" | "responder_edit" }[];
  approvedBy: string; approvedAt: string;
  approvedAssetIds: string[];       // only these photos are shareable
}

interface AccessGrant { noteId: string; orgId: string; tier: "fire" | "paramedic" | "ed"; expiresAt?: string }
interface Hold { id: string; scope: { incidentId?: string; captureId?: string };
                 reason: "death" | "police_coroner" | "complaint" | "access_request" | "grievance" | "litigation";
                 placedBy: string; placedAt: string; releasedAt?: string }
interface AuditEvent { id: string; ts: string; actorId: string; actorRole: string;
                       action: "view" | "edit" | "approve" | "export" | "delete" | "vault_access" | "break_glass" | "hold";
                       recordType: string; recordId: string; reason?: string;
                       prevHash: string; hash: string }
```

## 7. Access control (`packages/api`)

| Role | Sees | Notes |
|---|---|---|
| Fire responder | Own captures and own approved notes | Time-limited window after handoff (configurable). No health-card images. |
| Fire supervisor | Own department's captures | Same window. |
| Paramedic | Approved note and approved photos for incidents their service attended | Transcript only via the vault. |
| ED staff | Approved note and photos **only if** `destinationConfirmed` and `destinationHospitalId == their hospital` | Never raw material. |
| Vault reviewer | Raw audio, photos, transcript | Requires a second approver, a reason code, and a logged event. |
| Custodian admin | Retention settings, holds | The vendor has no default deletion authority. |

- Implement as **attribute-based rules** (role + org + incident + destination + time window), not hard-coded per route.
- **Break-glass** access requires a reason code and generates a high-priority audit event.
- Proactive audit report (random and targeted samples) is a later item.

## 8. Pipeline (`packages/pipeline`)

All external services sit behind interfaces so providers can be swapped or run locally.

```ts
interface Transcriber { transcribe(audio: Buffer, opts: { vocab?: string[] }): Promise<Transcript>; }
interface Diarizer    { flagNonResponder(t: Transcript, responderVoiceHint?: unknown): Promise<Transcript>; }
interface Condenser   { condense(t: Transcript, ctx: IncidentContext): Promise<DraftNote>; }
interface PhotoPass   { process(img: Buffer): Promise<{ img: Buffer; facesBlurred: boolean; healthNumberFlagged: boolean }>; }
```

- **Transcription:** batch (not live) for accuracy, with custom vocabulary (street names, unit numbers, medical terms) and speaker labels. Keep a **fake adapter** for tests. Current real adapter is OpenAI `whisper-1` (`real-adapters.ts`), a placeholder until the A/B below.
  - **Current (17 Oct 2026):** OpenAI `gpt-4o-transcribe` (fewer invented lines than `whisper-1` on quiet audio, same price; `NIGHTINGALE_TRANSCRIBE_MODEL=whisper-1` to compare), language forced to English (auto-detect was picking Japanese on quiet audio), temperature 0, an EMS vocabulary prompt (`DEFAULT_EMS_VOCAB`), +15 dB in-memory gain, and the silence gate. Chunks are cut on hard 30 s boundaries, so a word can be split between two chunks; a small overlap is a possible next step.
  - **Prototype pick (research, 17 Oct 2026):** A/B **Deepgram Nova-3** (pre-recorded, `diarize`, `smart_format`, `keyterm` up to 100 terms, about $0.005-0.008/min) against **AssemblyAI Universal-3.5 Pro** (keyterms up to 1,000, optional medical mode, about $0.21/hr plus add-ons) on 20 to 30 noisy drill clips. Both have TS SDKs. Keep whichever wins on word error rate and fact recall in the evaluation harness.
  - **Canadian residency path:** Azure Speech in `canadacentral` (batch and fast transcription, diarization, phrase lists, data stays in region), or Deepgram self-hosted/Dedicated on a Canadian cloud (enterprise deal). Deepgram and AssemblyAI cloud have no Canada endpoint today.
  - **Local fallback:** WhisperX (faster-whisper `large-v3-turbo` plus pyannote diarization) or NVIDIA Parakeet TDT 0.6B v3, as a worker on a laptop or Canadian VM. Gives an offline demo with no API key and a residency-safe option.
  - **Do not denoise before transcription.** Studies on medical audio found denoising (MetricGAN+, SAM-Audio) made ASR error rates worse in every configuration tested (arXiv 2512.17562, 2603.04710). Send raw audio to the transcriber; denoise only a human playback copy if at all.
  - **Silence trimming:** run Silero VAD on the server to skip empty clips and cut Whisper hallucinations on silence. Not on the Pi; the button is already the VAD.
  - **Diarization caveat:** one body-worn mic gives strong "wearer vs everyone else" separation and weak labels among the others. Treat speaker labels as wearer/other, and let the non-responder flag (section 2) err toward flagging.
  - **How comparable products do it (for reference):** Granola streams desktop audio (mic plus system audio, no bot) to Deepgram/AssemblyAI and keeps no audio. Pocket (YC W26) is a MagSafe clip-on recorder with a contact mic for calls and two mics for rooms, a physical record button, store-and-forward to the cloud for diarize, transcribe, summarize. Pocket is close to our design; its STT provider is not public.
- **Live path (built 17 Oct 2026), the main transcript now:** while recording, the Pi pipes `arecord` into both the chunk WAV and a long chunked `POST /live/<session>/audio` (raw 16 kHz pcm16, `device/src/livestream.rs`, reconnects on drop, drops frames instead of buffering when offline). The server (`packages/api/src/live-transcribe.ts`) runs an adaptive speech gate (only speech plus 0.5 s lead-in is sent, so silence never becomes text or clutter), resamples to 24 kHz, and streams it to OpenAI realtime `gpt-live-transcribe` (no prompt, English, near-field noise reduction). Words reach the dashboard about 0.3 s after they are said; each utterance is committed by the gate after 1 s of quiet, saved to the session, and triggers an ePCR update. Probed against the real API: exact text on test speech, empty output for 12 s of room noise and keyboard clicks.
- **Speaker labels (built 17 Oct 2026):** every saved chunk with speech goes to `gpt-4o-transcribe-diarize`, which tags each line with a voice. New voices become "Person 1", "Person 2", ... in the order first heard, and a 2-10 s reference clip of each (first 4, API limit) goes with every later chunk so the same voice keeps the same number. Labelled lines replace the live lines for that stretch, so the transcript shows words live first and speakers ~15-30 s later (chunks are 15 s). Labels are voices, not roles: nobody is marked responder vs patient yet, so the non-responder flag is off with real labels. The Pi sends its own clock with each upload (`deviceNow`) so the server can correct timestamps when the Pi's clock is off (no clock battery).
- **Gemini (switched 19 Oct 2026):** with `GEMINI_API_KEY` set, the same jobs run on Gemini at roughly half the price. Live words: `gemini-3.5-transcribe-live`, 16 kHz as is, one Gemini session per utterance (activityStart, audio, activityEnd), with a spare session always opened ahead so there's no wait; words stream while they're said and the finished line lands ~0.5 s after the speech gate closes. Probed on saved drills: one long session ignored the per-line boundaries and sent a single giant line at the end, and Gemini's own voice detection skipped whole stretches of quiet speech, hence a session per line. Speaker labels: `gemini-3.5-transcribe` with diarization and word timestamps (labels only come back per word). Gemini can't take known-speaker reference clips, so the clips are played in front of each chunk with a gap after each, and whichever label covers a clip is that person. The ePCR and photo captions use `gemini-2.5-flash` through Gemini's OpenAI-compatible endpoint (~2 s per ePCR update). OpenAI stays as the fallback (`NIGHTINGALE_PROVIDER=openai`). `packages/api/scripts/probe-gemini.mjs` re-checks all of it against saved audio. Neither provider labels speakers live; doing that locally was tested on 19 Oct and couldn't tell voices apart on the recordings we had (TV audio, one speaker), so it's parked until there's a real multi-person drill to test on.
- **Live gain and fast speech:** the live path normalises speech to about -20 dBFS (up to +36 dB) and keeps that boost between utterances, so a quick phrase isn't sent before the boost catches up; OpenAI's near-field noise reduction is off (it suppressed anyone not right at the mic). The Pi keeps the last 3 s of audio across a live-stream reconnect instead of dropping it.
- **Chunks are the record:** WAV chunks still upload to the vault and are what the speaker-labelled transcript is made from, so audio recorded while the live stream was down still gets transcribed. Silent chunks (loudest second under -50 dBFS) are saved but not sent anywhere.
- **Condensing:** the LLM output must be structured (matches `NoteSections`) and must cite `spans` back to transcript segments. Instruct it **not to add anything not in the transcript**. Anything it cannot support becomes an `unsupported_claim` flag. Keep the raw transcript next to the note.
- **Evaluation harness:** record about 10 realistic scripted clips with hand-written correct transcripts, then compute word error rate per provider and a fact-recall score per note. Use the same ten planted facts as the drill protocol.
- **Residency:** the prototype uses fictional data only. A real trial requires Canadian-region processing, a no-training agreement, and local processing as a fallback option. [LAWYER / vendor terms]

## 9. UI (`packages/web`)

1. **Responder review screen:** the draft note beside the transcript with highlighted source spans, flagged items (non-responder speech, health numbers, unsupported claims), photo thumbnails with blur toggles and purpose tags. Actions: edit, redact, approve and share. Nothing can be shared without approval.
2. **Receiver quick view (for paramedics and ED):** glanceable, minimal, readable in seconds before the full dashboard. Key facts first, photos second, provenance marker (AI / edited).
3. **Full dashboard:** incident history, notes by tier, audit trail, hold status. Role-appropriate views only.
4. **Admin:** retention settings per org, hold placement.
5. **Dev dashboard (drills only, never in a trial build), built:** one page at `GET /` (`packages/api/src/dashboard.ts`).
   - **ePCR box:** a draft ePCR (incident and times, scene with the scene photos, patient, chief complaint/OPQRST, SAMPLE, vitals table, assessment, interventions table, transport, bystander statements, narrative, needs-review flags). The server rebuilds it from the **whole session transcript** after every chunk (`refreshEpcr` in `app.ts`, condenser prompt `epcr-v2`), so it fills in and corrects itself; changed fields flash. Vitals are only numbers someone said aloud. No impression/diagnosis field (section 2). Photos open full size with their caption.
   - **Transcript box:** the running transcript, chunk by chunk, with each chunk's loudness; silent chunks show as skipped.
   - Labelled "draft, pending review". No access control, so it must only ever show fictional drill data.
   - Console: device and server log lines live, plus a status strip (API connected, device on / last heard, latest heartbeat).
   - Updates are pushed: the page listens on `/dev/stream` (server-sent events) and re-reads `/dev/sessions` the moment an asset changes. A 15 s poll is only a fallback.
   - **Every device connection is its own saved test** (`packages/api/src/drills.ts`): `drills/<date>_<time>_<session>/` with `session.json`, `transcript.md`, `epcr.md`, `console.log`, `photos/`, `audio/`. Sessions reload when the API restarts and are never reset automatically; a session picker switches between them. The **New session** button (`POST /dev/sessions/new`) starts a fresh session without touching the Pi: from that moment, everything the Pi sends (chunks by capture time, live lines by when they were said, logs) goes to the new session, which gets its own folder, an empty ePCR and speakers numbered from Person 1 again. The previous session is kept as it was. Raw audio and photos are gitignored (size, real voices and faces); the text files can be committed for review.

## 10. Retention and holds (`packages/retention`)

```
SEALED --retention elapsed AND no active hold--> DESTROYED (certificate + hash-chained log entry)
SEALED --hold placed--> HELD (clock paused) --hold released--> SEALED (clock resumes)
```

- The retention period is set **per custodian org**. The vendor ships no default deletion.
- Active holds always block destruction. Approving a note does not trigger deletion.
- Daily job evaluates the clocks. Every state change writes an audit event.

## 11. Suggested stack (defaults; swappable)

- Node 22+, TypeScript, pnpm workspaces, Vitest.
- API: Fastify or Hono. DB: Postgres (docker-compose for local). Object store: S3-compatible (SeaweedFS locally, see docker-compose.yml; MinIO was the original pick but locked its free docker images behind a login in 2025) with per-object encryption.
- Queue: pg-boss (keeps infrastructure to one database). Validation: zod.
- Web: React (Vite). Auth: simple JWT with seeded demo users and roles for the prototype.
- Device: stable Rust, `rppal` (GPIO), `reqwest` + `rustls` (upload), `serde` + `toml` (config), `sha2` (checksums), `cpal` (optional audio), `cross` (cross-compile to aarch64). Camera and audio via the `rpicam-still` and `arecord` subprocesses.

## 12. Build order (milestones)

**Status (17 Oct 2026):** 0 to 3 done (scaffold, ingest + Rust upload client, hash-chained audit, pipeline end to end with fake adapters plus OpenAI transcriber/condenser/captioner behind the interfaces). 7 partly done: `capture.rs` shells out to `rpicam-still` (now `-t 1000`, about 1.5-2 s per photo) and `arecord`; `main.rs` runs a no-button continuous drill mode (agreed for now, see question 6) with capture writing into an on-disk queue (`queue.rs`) and background uploaders draining it, so recording never pauses for an upload and nothing is deleted before the server acks. 7d mostly done: `systemd` unit with `Restart=always`, `device/deploy.sh`, dev log shipping and heartbeat (`devlog.rs`). Two-button state machine done (`machine.rs`, `button.rs`, `hw.rs`): POWER/RECORD on GPIO3, PHOTO on GPIO17, burst-and-pick-sharpest photos, fsync'd queue then `systemctl poweroff`, mock mode (keyboard buttons), tests for every case in the button spec. No timed photos exist anymore. LED, buzzer and notice audio are optional config until that hardware is wired. Uploads use 8 MB parts so photos go up as one part (S3 rejects non-final parts under 5 MB). The API skips transcribing chunks whose loudest second is under -50 dBFS (`NIGHTINGALE_SILENCE_DBFS`), since Whisper invents text from silence. **No vocabulary prompt is sent to the transcriber by default:** an EMS/hospital-name prompt made `gpt-4o-transcribe` invent whole radio calls from near-silent audio (17 Oct 2026). The S3 vault now writes one object on complete instead of an S3 multipart upload, so any part size works. Still open in 7d: button-gated audio, watchdog. 9 done as one page at `/`. 4, 5, 6 not started.

0. **Scaffold** the monorepo, `schema` package, CI (typecheck, lint, test), docker-compose, `fixtures` with 2 fictional scenarios.
1. **Ingest API** with chunked, resumable upload into the vault, plus a Rust upload client (`device/src/upload.rs`) tested against it.
2. **Audit library** (hash-chained) and wire it into every API mutation and read.
3. **Pipeline** with fake adapters end to end (audio to draft note), then the evaluation harness.
4. **Access control** and its **test matrix** (see section 13). Do this before building more UI.
5. **Review UI**, then the **tiered dashboard** and receiver quick view.
6. **Retention service** with hold logic and destruction certificates.
7. **Device daemon (Rust)**:
   - **7a. Checkpoint, before writing any Rust:** on the real Pi, prove the hardware from the shell with `rpicam-hello`, `rpicam-still` and `arecord`. Then cross-compile a hello-world with `cross`, copy it over with `scp`, and run it. If this takes more than about a week, switch the device to Python (same HTTP contract) and note it here.
   - **7a status (13 Oct 2026):** camera proven from the shell. Arducam IMX519 on the Zero 2 W (`dtoverlay=imx519` and `camera_auto_detect=0` in `/boot/firmware/config.txt`; 22-to-22-pin ribbon, silver contacts toward the flap at the camera end, blue tip up at the Pi end). Autofocus works with Arducam's trixie libcamera build (see section 5). Hardware proven: camera, capture, `scp` transfer, passwordless SSH key. **Still open for 7a:** `arecord` and the microphone (mic plug and USB sound card), the `cross` hello-world, resolution/tuning comparison, a continuous-stream burst, and testing in other rooms and light (needs the battery or boost board).
   - **7b.** Daemon in mock mode (WAV file and test image instead of hardware), with the state machine, queue and upload.
   - **7c.** Real camera, mic, button, LED and buzzer on the Pi, run as a `systemd` service.
   - **7d.** Service lifecycle and telemetry (section 5): button-gated IDLE on boot, `SIGTERM` flush, watchdog, `deploy.sh`, dev log shipping and heartbeat.
8. **Real providers** (one transcriber, one LLM) behind the interfaces, run against the fixtures. Then the evaluation harness compares providers (section 8).
9. **Dev dashboard** (section 9, item 5): live feed plus console over SSE.

## 13. Tests that matter most

- **Access matrix tests:** for every role and record type, assert allow or deny. Include: ED user at the wrong hospital, ED user before `destinationConfirmed`, fire user after the window expires, paramedic requesting raw audio.
- **Retention tests:** destruction blocked by each hold type, clock resumes after release, nothing deleted on approval.
- **Pipeline tests:** golden transcripts to notes. Assert every field has a source span, unsupported content becomes a flag, and the raw transcript is preserved.
- **Device tests (`cargo test`, mock mode):** auto-stop at max length, no recording without a button event, queue survives a simulated crash, no local deletion before the server ack.
- **Audit tests:** hash chain verifies, and tampering is detected.

## 14. Open questions (carry into the lawyer and mentor conversations)

1. Is fire a custodian, an agent of the paramedic service, or neither? Can an agency agreement fix it, or does fire keep only a minimal extract? [LAWYER]
2. Can raw audio be deleted after approval given retention and hold duties? (The design keeps sealed retention instead.) [LAWYER]
3. Does capturing bystander audio, or any pre-roll buffer, risk the Criminal Code interception rule? (The design avoids pre-roll and flags non-responder speech.) [LAWYER]
4. Who is the first trial buyer and signer (township chief, regional paramedic service)? This decides which tiers the first trial needs.
5. Union consultation and a joint privacy impact assessment before any trial with real calls.
6. ~~Continuous recording from boot vs the button-only rule.~~ Resolved 17 Oct 2026: the POWER/RECORD button boots the Pi and recording starts on boot, so every recording is button-initiated (section 5, Buttons).
