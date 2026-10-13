import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { S3VaultStore } from "./vault.js";

// local dev entrypoint, talks to the minio from docker-compose.yml at the repo root
const vault = new S3VaultStore({
  endpoint: process.env.VAULT_ENDPOINT ?? "http://localhost:9000",
  bucket: process.env.VAULT_BUCKET ?? "nightingale-vault",
  accessKeyId: process.env.VAULT_ACCESS_KEY ?? "nightingale",
  secretAccessKey: process.env.VAULT_SECRET_KEY ?? "nightingale-dev",
});

const app = createApp(vault);
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`nightingale api listening on :${info.port}`);
});
