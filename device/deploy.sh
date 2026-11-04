#!/usr/bin/env bash
# build the daemon on this machine, copy it to the pi, (re)install the systemd service,
# restart it. run from anywhere: ./device/deploy.sh
#
# env overrides:
#   PI=henliz@nightingale.local        ssh target
#   API_URL=https://<host>:8787         where the pi sends uploads + logs
#   DEVICE_TOKEN=<32+ chars>            per-device ingest token; never commit it
#   PROFILE=release|debug               default release (smaller, faster)
#   MAX_CLIP_SECONDS=1800               safety net: recording auto-stops (save, queue, power off) after this
#   LED_PIN= BUZZER_PIN=                optional bcm pins, nothing wired yet
#   NOTICE_WAV=/home/henliz/notice.wav  optional, played after the ready tone (aplay)
# the buttons are fixed: POWER/RECORD gpio 3 (pin 5), PHOTO gpio 17 (pin 11)
set -euo pipefail
umask 077

cd "$(dirname "$0")"

PI="${PI:-henliz@nightingale.local}"
PROFILE="${PROFILE:-release}"
TARGET=aarch64-unknown-linux-gnu

if [[ -z "${API_URL:-}" || "$API_URL" != https://* ]]; then
  echo "API_URL must be an https:// endpoint" >&2
  exit 1
fi
if [[ -z "${DEVICE_TOKEN:-}" || ${#DEVICE_TOKEN} -lt 32 ]]; then
  echo "DEVICE_TOKEN must be at least 32 characters" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "docker isn't running (cross builds inside it). start it with: colima start" >&2
  exit 1
fi

# cross's build images are x86 only, on an apple silicon mac they run under emulation.
# first build is slow (~5 min), later ones reuse the cache. one-time setup on a new mac:
#   rustup toolchain add stable-x86_64-unknown-linux-gnu --profile minimal --force-non-host
if [[ "$(uname -m)" == "arm64" ]]; then
  export CROSS_CONTAINER_OPTS="${CROSS_CONTAINER_OPTS:-} --platform linux/amd64"
fi

echo "==> building ($PROFILE) for $TARGET"
# the "jemalloc: MADV_DONTNEED" lines are harmless noise from running under emulation
if [[ "$PROFILE" == "release" ]]; then
  cross build --release --target "$TARGET" 2> >(grep -v -e jemalloc -e "expected behaviour if you are running under QEMU" >&2)
else
  cross build --target "$TARGET" 2> >(grep -v -e jemalloc -e "expected behaviour if you are running under QEMU" >&2)
fi
BIN="target/$TARGET/$PROFILE/nightingale-device"

echo "==> writing env file (api at $API_URL)"
ENV_FILE="$(mktemp)"
cat > "$ENV_FILE" <<ENV
NIGHTINGALE_API_URL=$API_URL
NIGHTINGALE_DEVICE_TOKEN=$DEVICE_TOKEN
NIGHTINGALE_DEV=1
NIGHTINGALE_AUDIO_CHUNK_SECONDS=${AUDIO_CHUNK_SECONDS:-15}
NIGHTINGALE_MAX_CLIP_SECONDS=${MAX_CLIP_SECONDS:-1800}
NIGHTINGALE_POWER_PIN=3
NIGHTINGALE_PHOTO_PIN=17
NIGHTINGALE_QUEUE_DIR=/home/henliz/nightingale-queue
ENV
for opt in LED_PIN BUZZER_PIN NOTICE_WAV; do
  if [[ -n "${!opt:-}" ]]; then echo "NIGHTINGALE_$opt=${!opt}" >> "$ENV_FILE"; fi
done
# mic: leave NIGHTINGALE_AUDIO_DEVICE unset to use the pi's default input (what we
# tested). once the usb sound card's in, add e.g. AUDIO_DEVICE=plughw:1,0 (arecord -l)
if [[ -n "${AUDIO_DEVICE:-}" ]]; then
  echo "NIGHTINGALE_AUDIO_DEVICE=$AUDIO_DEVICE" >> "$ENV_FILE"
fi

# one ssh connection reused for every step below, so the pi's password is asked once
# (run `ssh-copy-id $PI` once and it's never asked at all)
SSH_OPTS=(-o ControlMaster=auto -o "ControlPath=/tmp/nightingale-ssh-%r@%h-%p" -o ControlPersist=300)

# stop the recorder FIRST. if it's mid-recording it would otherwise keep going during
# the deploy and could hit its max clip length and power the pi off halfway through
# (that's exactly what happened on 17 oct). stopping it saves the recording properly
echo "==> stopping the recorder on $PI (saves anything mid-recording; may ask for the pi's password, then sudo)"
ssh "${SSH_OPTS[@]}" -t "$PI" 'sudo systemctl stop nightingale-device 2>/dev/null || true; echo "    stopped"'

echo "==> copying to $PI"
scp "${SSH_OPTS[@]}" -q "$BIN" "$PI:nightingale-device.new"
scp "${SSH_OPTS[@]}" -q "$ENV_FILE" "$PI:nightingale.env"
scp "${SSH_OPTS[@]}" -q systemd/nightingale-device.service "$PI:nightingale-device.service"
rm -f "$ENV_FILE"

echo "==> installing + starting the new version (may ask for sudo again)"
ssh "${SSH_OPTS[@]}" -t "$PI" '
  set -e
  chmod +x ~/nightingale-device.new
  mv ~/nightingale-device.new ~/nightingale-device
  sudo mv ~/nightingale-device.service /etc/systemd/system/nightingale-device.service
  sudo systemctl daemon-reload
  sudo systemctl enable nightingale-device >/dev/null 2>&1
  # the daemon owns gpio 3 + 17. gpio-shutdown would fight it for gpio 3, and i2c
  # uses gpio 3 as sda, so both have to be off
  cfg=/boot/firmware/config.txt
  if grep -Eq "^[[:space:]]*dtoverlay=gpio-shutdown" "$cfg"; then
    echo "!! $cfg enables dtoverlay=gpio-shutdown, comment it out and reboot"
  fi
  if grep -Eq "^[[:space:]]*dtparam=i2c_arm=on" "$cfg"; then
    echo "!! $cfg turns i2c on (gpio 3 is i2c sda), set dtparam=i2c_arm=off and reboot"
  fi
  sudo systemctl restart nightingale-device
  sleep 2
  systemctl --no-pager --lines=8 status nightingale-device || true
'
ssh "${SSH_OPTS[@]}" -O exit "$PI" 2>/dev/null || true

echo
echo "==> done. the status above should say \"RECORDING (max 1800s)\". if it says 90s, the old"
echo "    version is still running, tell claude."
echo "    heads up: starting the service just now started a recording (record on boot),"
echo "    press POWER/RECORD to stop it and power the pi off. from now on: press to turn on"
echo "    and record, PHOTO for a photo, press POWER/RECORD again to save + power off. watch it:"
echo "    dashboard:  http://localhost:8787  (start the api first: pnpm --filter @nightingale/api dev)"
echo "    on the pi:  ssh $PI journalctl -fu nightingale-device -o cat"
