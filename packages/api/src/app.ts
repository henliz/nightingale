import { createAuditLog, MemoryAuditStore } from "@nightingale/audit";
import { AssetKind, PhotoPurpose } from "@nightingale/schema";
import type { Context } from "hono";
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

// real identity/auth is milestone 4 (access control), these headers are just a
// stand-in so audit events have someone to point at in the meantime
function actorFrom(c: Context) {
  return {
    actorId: c.req.header("x-actor-id") ?? "unknown",
    actorRole: c.req.header("x-actor-role") ?? "unknown",
  };
}

export function createApp(vault: VaultStore, auditLog = createAuditLog(new MemoryAuditStore())) {
  const tracker = createUploadTracker(vault);
  const app = new Hono();

  app.post("/captures/:captureId/assets", async (c) => {
    const body = InitAssetRequest.parse(await c.req.json());
    const result = await tracker.initAsset(c.req.param("captureId"), body);
    await auditLog.record({
      ...actorFrom(c),
      action: "vault_access",
      recordType: "Asset",
      recordId: result.assetId,
      reason: "init upload",
    });
    return c.json(result, 201);
  });

  app.put("/assets/:assetId/parts/:partNumber", async (c) => {
    const assetId = c.req.param("assetId");
    const partNumber = Number(c.req.param("partNumber"));
    if (!Number.isInteger(partNumber) || partNumber < 1) {
      throw new HttpError(400, "partNumber must be a positive integer");
    }
    const body = new Uint8Array(await c.req.arrayBuffer());
    const result = await tracker.uploadPart(assetId, partNumber, body);
    await auditLog.record({
      ...actorFrom(c),
      action: "vault_access",
      recordType: "Asset",
      recordId: assetId,
      reason: `part ${partNumber}`,
    });
    return c.json(result);
  });

  app.get("/assets/:assetId", async (c) => {
    const assetId = c.req.param("assetId");
    const result = tracker.getStatus(assetId);
    await auditLog.record({ ...actorFrom(c), action: "view", recordType: "Asset", recordId: assetId });
    return c.json(result);
  });

  app.post("/assets/:assetId/complete", async (c) => {
    const assetId = c.req.param("assetId");
    const result = await tracker.complete(assetId);
    await auditLog.record({
      ...actorFrom(c),
      action: "vault_access",
      recordType: "Asset",
      recordId: assetId,
      reason: "complete + sha256 verify",
    });
    return c.json(result);
  });

  // no access control on this yet either, same milestone 4 caveat as above.
  // mostly here so the audit trail is actually inspectable/demoable right now
  app.get("/_audit", async (c) => {
    const events = await auditLog.list();
    const verified = await auditLog.verify();
    await auditLog.record({ ...actorFrom(c), action: "view", recordType: "AuditLog", recordId: "all" });
    return c.json({ events, verified });
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400 | 404 | 409);
    if (err instanceof z.ZodError) return c.json({ error: "bad request", issues: err.issues }, 400);
    console.error(err);
    return c.json({ error: "something broke on our end" }, 500);
  });

  return app;
}
