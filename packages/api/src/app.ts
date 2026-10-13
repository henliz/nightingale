import { AssetKind, PhotoPurpose } from "@nightingale/schema";
import { Hono } from "hono";
import { z } from "zod";
import { HttpError } from "./http-error.js";
import { createUploadTracker } from "./uploads.js";
import type { VaultStore } from "./vault.js";

// not the full Asset schema, just what the init call actually needs. reuses the
// enums from @nightingale/schema so "audio"/"photo"/etc stay defined in one place
const InitAssetRequest = z.object({
  kind: AssetKind,
  sha256: z.string().length(64),
  photoPurpose: PhotoPurpose.optional(),
});

export function createApp(vault: VaultStore) {
  const tracker = createUploadTracker(vault);
  const app = new Hono();

  app.post("/captures/:captureId/assets", async (c) => {
    const body = InitAssetRequest.parse(await c.req.json());
    const result = await tracker.initAsset(c.req.param("captureId"), body);
    return c.json(result, 201);
  });

  app.put("/assets/:assetId/parts/:partNumber", async (c) => {
    const partNumber = Number(c.req.param("partNumber"));
    if (!Number.isInteger(partNumber) || partNumber < 1) {
      throw new HttpError(400, "partNumber must be a positive integer");
    }
    const body = new Uint8Array(await c.req.arrayBuffer());
    const result = await tracker.uploadPart(c.req.param("assetId"), partNumber, body);
    return c.json(result);
  });

  app.get("/assets/:assetId", (c) => {
    const result = tracker.getStatus(c.req.param("assetId"));
    return c.json(result);
  });

  app.post("/assets/:assetId/complete", async (c) => {
    const result = await tracker.complete(c.req.param("assetId"));
    return c.json(result);
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400 | 404 | 409);
    if (err instanceof z.ZodError) return c.json({ error: "bad request", issues: err.issues }, 400);
    console.error(err);
    return c.json({ error: "something broke on our end" }, 500);
  });

  return app;
}
