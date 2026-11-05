# device

rust capture daemon for the raspberry pi zero 2 w. separate cargo toolchain from the rest
of the monorepo on purpose, see ARCHITECTURE.md section 4 and 5.

- `src/upload.rs`: reads a file, chunks it, pushes it through the ingest api in
  `packages/api` (init -> upload each part -> complete, sha256 checked on both ends).
  tested against a mocked http server, not a live node process, since the only real
  contract between the two is http (ARCHITECTURE.md section 4). Production uploads,
  logs, and live audio use a per-device bearer token.
- `src/capture.rs`: shells out to `rpicam-still` (autofocus on capture, `-t 1000` so a
  photo takes ~1.5-2s instead of ~6s) and `arecord`, the same tools already proven from
  the shell on the real pi. not unit tested, no rust-side hardware mock yet (7b).
- `src/queue.rs`: on-disk store-and-forward queue. capture writes into `incoming/`, a
  finished file gets renamed into the queue, uploaders drain it oldest first and only
  delete after the server acks. anything cut off by a crash or power loss gets recovered
  and uploaded on the next start.
- `src/devlog.rs`: every log line prints locally (journalctl) and, with
  `NIGHTINGALE_DEV=1`, also gets shipped to the laptop's `POST /dev/logs` so the
  dashboard console shows it live. never blocks capture, never carries content.
- `src/machine.rs`: the capture state machine from the button spec (ARCHITECTURE.md
  section 5): BOOTING -> RECORDING -> (POWER/RECORD press or max_clip_seconds) -> SAVING
  -> QUEUED -> POWERING OFF, PHOTO only while recording. tests cover every case.
- `src/button.rs`: POWER/RECORD on gpio 3 (pin 5, ground pin 6), PHOTO on gpio 17
  (pin 11, ground pin 9). pull-ups, active-low, 30 ms debounce, a button held through
  boot has to be released before it counts.
- `src/hw.rs`: the real pi (arecord, rpicam burst, optional led/buzzer/notice wav,
  `systemctl poweroff`) and mock mode (`NIGHTINGALE_MOCK=1`, keyboard `r` / `p` + enter
  are the buttons, runs on a laptop).
- `src/main.rs`: wires it up, plus uploaders and a 30s heartbeat. no timed photos.

mock mode on the laptop, against a running api:

```
NIGHTINGALE_MOCK=1 NIGHTINGALE_DEV=1 NIGHTINGALE_ALLOW_INSECURE_DEV=1 cargo run
```

For a non-mock device, set `NIGHTINGALE_API_URL` to an `https://` endpoint and
provide `NIGHTINGALE_DEVICE_TOKEN` with the same 32+ character secret configured in
the API's `NIGHTINGALE_API_KEYS` as an `ingest` principal. Never commit the token.
The API and device remain fictional-data-only for this school prototype.

## the whole loop: pi -> laptop -> dashboard

1. **laptop, start the vault + api** (repo root):

   ```
   colima start                      # docker, if it isn't running
   docker compose up -d vault
   pnpm --filter @nightingale/api dev
   ```

   the terminal prints every log line too. open http://localhost:8787 for the dashboard.
   with `OPENAI_API_KEY` in `.env` it's real transcription, without it it's fake adapters.

2. **pi, press POWER/RECORD.** it boots, joins a saved wifi (home or the hotspot, see
   below) and starts recording. PHOTO takes a photo. POWER/RECORD again saves and powers
   it off. the dashboard shows "nightingale is on", "RECORDING", photos, transcripts, the
   epcr. anything not uploaded before power off uploads on the next boot.

3. **ship new code to the pi** (laptop, any time):

   ```
   ./device/deploy.sh
   ```

   builds with `cross`, copies the binary + env file + systemd unit over, enables the
   service and restarts it. the pi reaches the laptop by its mdns name
   (`<this mac's LocalHostName>.local:8787`), so no ip editing when the network changes.
   overrides: `PI=user@host`, `API_URL=https://...`, `AUDIO_DEVICE=plughw:1,0`
   (once the usb sound card's in, find it with `arecord -l`), `MAX_CLIP_SECONDS` (default
   90), `AUDIO_CHUNK_SECONDS`, `LED_PIN`, `BUZZER_PIN`, `NOTICE_WAV`, `PROFILE=debug`.
   the button pins are fixed (3 and 17).

   one-time setup on an apple silicon mac (cross's images are x86 only, deploy.sh runs
   them under emulation, first build ~5 min, cached after):

   ```
   rustup toolchain add stable-x86_64-unknown-linux-gnu --profile minimal --force-non-host
   ```

handy on the pi:

```
journalctl -fu nightingale-device -o cat   # follow the logs
sudo systemctl stop nightingale-device     # stop capturing
sudo systemctl disable nightingale-device  # stop it starting on boot
ls ~/nightingale-queue                     # what's waiting to upload
```

the macos firewall may ask whether node can accept incoming connections the first time
the pi connects, say allow. if the dashboard says "no device heard from yet", check the
pi's on the same network and `ping <LocalHostName>.local` works from the pi.

## working off your home network

the pi needs to reach your laptop regardless of which network you're both on. two ways
to set that up ahead of time:

**phone hotspot as a known network** (what we're using): raspberry pi os (trixie) uses
NetworkManager, which tries every saved network it can see, not just the most recent one.
add your hotspot the same way you'd add any wifi:

```
sudo nmcli device wifi connect "<hotspot-ssid>" password "<hotspot-password>"
```

that's it, it's saved and will auto-connect whenever home wifi isn't in range. both the
pi and your laptop need to join the *same* hotspot for them to reach each other. a few
phones restrict device-to-device traffic on their hotspot ("client isolation"), worth
testing ahead of time, not during the actual demo.

finding the pi's address once it's on an unfamiliar network: raspberry pi os ships avahi,
so `ssh henliz@nightingale.local` works on any network without needing to know its ip
(this pi's hostname is `nightingale`, username is `henliz`), as long as mdns isn't
blocked (same client-isolation caveat as above).

**usb cable instead**, if the hotspot route gives you trouble: the pi can act as a wired
network device over usb (no wifi involved for the pi<->laptop link at all), your laptop's
own internet can come from anywhere separately. not set up yet, ask if you want it.

## local dev (no pi)

```
cargo build
cargo test
cargo fmt --check
cargo clippy
```
