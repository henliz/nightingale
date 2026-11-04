# Nightingale security demo

This walkthrough uses fictional drill data only. It demonstrates the MVP controls;
it is not a production approval or PHIPA/MFIPPA compliance test.

## 1. Start the local demo

From the repository root:

```bash
pnpm install
pnpm --filter @nightingale/api dev:memory
```

In another terminal:

```bash
pnpm --filter @nightingale/web dev
```

Open `http://localhost:5173`.

## 2. Demonstrate authorization

The API test suite covers the same behavior in
`packages/api/src/app.test.ts`:

- no credential → `401 Unauthorized`
- authenticated actor without access → `403 Forbidden`
- authorized reviewer → `200 OK`

The secured server accepts `Authorization: Bearer <token>` and maps the token to
explicit permissions. Do not put real secrets in source control or browser bundles.

## 3. Demonstrate device protection

Mock mode is intentionally local and insecure for fictional drills:

```bash
NIGHTINGALE_MOCK=1 NIGHTINGALE_DEV=1 cargo run --manifest-path device/Cargo.toml
```

Outside mock mode, the device refuses non-HTTPS URLs and requires a 32+ character
`NIGHTINGALE_DEVICE_TOKEN`. Uploads, logs, and live audio use that token.

## 4. Demonstrate auditability

Use the secured API with an actor that has `audit` permission, then inspect `/_audit`.
The response includes the audit events and hash-chain verification result. In the
production-style server, events are persisted to `NIGHTINGALE_AUDIT_FILE`.

## 5. Evidence to capture

For the capstone presentation, capture screenshots of:

1. The dashboard showing a fictional drill.
2. The `401` and `403` authorization responses.
3. A successful authorized request.
4. The audit log with `verified.valid: true`.
5. The device refusing an insecure URL or missing token.
