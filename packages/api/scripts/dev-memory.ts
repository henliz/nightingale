// the api over an in-memory vault and the repo's saved drills, no docker needed. enough for the
// dashboard's api mode (packages/web, `?source=api`): sessions, ePCRs, transcripts, photos that
// are on this machine, and the event stream. uploads from a device still work but vanish on exit.
import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { createFsDrillStore } from "../src/drills.js";
import { createLiveHub } from "../src/live.js";
import { MemoryVaultStore } from "../src/vault.js";

const live = createLiveHub({ echo: true });
const drillsDir = process.env.NIGHTINGALE_DRILLS_DIR ?? fileURLToPath(new URL("../../../drills/", import.meta.url));
const app = createApp(new MemoryVaultStore(), undefined, undefined, undefined, live, {
  drills: createFsDrillStore(drillsDir),
  processInBackground: true,
});
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  live.log("server", "info", `api (memory vault, no docker) on :${info.port}, drills from ${drillsDir}`);
});
