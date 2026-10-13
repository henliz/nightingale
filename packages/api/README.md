# @nightingale/api

milestone 1 done: chunked, resumable ingest into the sealed vault.

- `POST /captures/:captureId/assets`: start an upload, body is `{ kind, sha256, photoPurpose? }`, returns `{ assetId, vaultKey, nextPartNumber }`
- `PUT /assets/:assetId/parts/:partNumber`: upload one chunk, raw bytes, parts must land in order (that's the resumability story, ask where you left off and keep going)
- `GET /assets/:assetId`: status check, tells you `receivedParts` + `nextPartNumber` so a device can resume after dropping offline
- `POST /assets/:assetId/complete`: finishes the multipart upload, reads the assembled object back, verifies its sha256 against what was declared at init

`vault.ts` has two `VaultStore` adapters: `MemoryVaultStore` (fake, what the tests use) and `S3VaultStore` (real, talks to the minio in the root `docker-compose.yml`). `pnpm --filter @nightingale/api run dev` runs the real server against minio.

heads up: minio/s3 multipart requires every part except the last to be at least 5mb. drill clips fit under that today so it only works as a single part upload, see the comment in `vault.ts` if clip sizes ever grow.

still a placeholder: attribute based access control, that's **milestone 4** (ARCHITECTURE.md section 7).
