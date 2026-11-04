# @nightingale/api

chunked, resumable ingest into the sealed vault, wired to the pipeline on the audio side.

- `POST /captures/:captureId/assets`: start an upload, body is `{ kind, sha256, photoPurpose? }`, returns `{ assetId, vaultKey, nextPartNumber }`
- `PUT /assets/:assetId/parts/:partNumber`: upload one chunk, raw bytes, parts must land in order (that's the resumability story, ask where you left off and keep going)
- `GET /assets/:assetId`: status check, tells you `receivedParts` + `nextPartNumber` so a device can resume after dropping offline
- `POST /assets/:assetId/complete`: finishes the multipart upload, reads the assembled object back, verifies its sha256 against what was declared at init. if `kind` is `audio`, this also runs it through `@nightingale/pipeline` right then and there (not a queue/background job yet)
- `GET /assets/:assetId/note`: the `DraftNote` the pipeline produced, as json. 404 until the audio asset's `/complete` call has finished, or if the asset was a photo (nothing to transcribe)
- `GET /assets/:assetId/download`: streams the raw bytes back, so a photo can actually be viewed in a browser instead of only living in the vault

dev routes (drills only; production access is scoped by API key permissions):

- `GET /`: the live dashboard, ePCR box + transcript box + console
- `POST /live/:sessionId/audio`: the pi streams raw mic audio here while recording, transcribed word by word (`live-transcribe.ts`, `NIGHTINGALE_LIVE_MODEL`, default `gemini-3.5-transcribe-live` with a Gemini key, `gpt-live-transcribe` with an OpenAI one)
- `POST /dev/logs`: the pi ships its log lines here (`{ deviceId, sessionId, lines }`)
- `GET /dev/stream`: server-sent events, log lines + "something changed" pings
- `POST /dev/sessions/new`: the dashboard's "New session" button, splits a fresh session off the device's current one from now on
- `GET /dev/sessions`: every drill session, its assets, transcripts and session-wide ePCR
- `GET /dev/files/:dir/:sub/:name`: raw photos/audio saved in a drill folder

every device connection is saved to `drills/<date>_<time>_<session>/` at the repo root
(`drills.ts`, override with `NIGHTINGALE_DRILLS_DIR`) and reloaded on restart, see
ARCHITECTURE.md section 9. other knobs: `NIGHTINGALE_TRANSCRIBE_MODEL` (default
`gpt-4o-transcribe`), `NIGHTINGALE_SILENCE_DBFS` (default -50).

`vault.ts` has two `VaultStore` adapters: `MemoryVaultStore` (fake, what the tests use) and `S3VaultStore` (real, talks to the s3-compatible vault in the root `docker-compose.yml`, and creates the bucket on startup if it doesn't exist yet). `pnpm --filter @nightingale/api run dev` runs the real server against it.

that vault is **SeaweedFS**, not MinIO. MinIO was the original pick (ARCHITECTURE.md section 11) but locked its free docker images behind a login in 2025, so `docker-compose.yml` runs SeaweedFS's S3 gateway instead, same S3 API, same code in `vault.ts` either way. credentials live in `docker/seaweedfs-s3-config.json` (dev only, fake creds).

transcription is real if `GEMINI_API_KEY` (preferred, about half the cost) or `OPENAI_API_KEY` is set. `NIGHTINGALE_PROVIDER=openai` forces openai with both. after adding a gemini key, `pnpm build && node scripts/probe-gemini.mjs` checks it against saved drill audio (loaded from a root `.env` if one exists, see `--env-file-if-exists` in the `dev` script), otherwise it falls back to `@nightingale/pipeline`'s `FakeTranscriber`. condenser and captioner are real with a key too; the diarizer is still fake, see that package's README.

heads up: s3 multipart requires every part except the last to be at least 5mb, most s3-compatible stores enforce the same rule. the pi sends 8 mb parts so photos and chunks always go up as one part (2 mb parts broke photos, oct 17 2026).

The production server requires an API key on every patient-data, ingest, audit, and
development route. Configure `NIGHTINGALE_API_KEYS` as a JSON array, for example:

```json
[{"id":"device-1","secret":"replace-with-a-long-random-secret","actorId":"device-1","actorRole":"device","permissions":["ingest"]},{"id":"reviewer-1","secret":"replace-with-another-long-random-secret","actorId":"reviewer-1","actorRole":"ed","permissions":["read","audit","admin"]}]
```

Clients send `Authorization: Bearer <secret>` (or `x-api-key`). Asset uploads are
bound to the authenticated actor; other actors need the `admin` permission. The
server also requires `NIGHTINGALE_AUDIT_FILE` (defaulting to a private file under
the operator's home directory) for durable hash-chained JSONL audit events. The
test factory intentionally retains its legacy headers only for fictional tests.
API secrets must be at least 32 characters. If no keys are configured, the server
refuses to start unless `NIGHTINGALE_ALLOW_INSECURE_DEV=1` is explicitly set for
fictional local drills; that mode enables the legacy demo headers and must never be
used with patient information.

The current browser demo client does not contain a production login or token
exchange. Run it only behind a same-origin reverse proxy that authenticates the
operator and injects the API key server-side, or use the API directly with a
properly scoped key. Do not put a device or administrator key in a Vite/browser
bundle, URL, or source-controlled `.env` file.

This is MVP hardening, not a PHIPA/MFIPPA compliance claim. Before real patient
data, add a real identity provider, organization/role policy, approved sharing and
break-glass workflows, retention/hold/destruction controls, privacy impact and
threat assessments, contractual/vendor review, key management, monitoring, backups,
incident response, and independent security/privacy review. See the detailed
[privacy and security readiness checklist](../../PRIVACY-SECURITY-READINESS.md).
