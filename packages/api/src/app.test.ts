import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { MemoryVaultStore } from "./vault.js";

function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

// Response.json() types as unknown, these are just the shapes we actually read in the asserts below
interface InitAssetResponse {
  assetId: string;
  vaultKey: string;
  nextPartNumber: number;
}
interface PartResponse {
  partNumber: number;
  nextPartNumber: number;
}
interface StatusResponse {
  status: string;
  receivedParts: number[];
}
interface CompleteResponse {
  verified: boolean;
  sha256: string;
}
interface AuditResponse {
  events: { action: string; recordType: string; recordId: string; actorId: string }[];
  verified: { valid: boolean };
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe("ingest api", () => {
  it("uploads a file across two chunks and verifies it on complete", async () => {
    const app = createApp(new MemoryVaultStore());
    const bytes = new TextEncoder().encode("fake audio bytes for a short drill clip");
    const sha256 = sha256Hex(bytes);
    const chunk1 = bytes.slice(0, 20);
    const chunk2 = bytes.slice(20);

    const initRes = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "audio", sha256 }),
    });
    expect(initRes.status).toBe(201);
    const init = await json<InitAssetResponse>(initRes);
    expect(init.nextPartNumber).toBe(1);

    const part1Res = await app.request(`/assets/${init.assetId}/parts/1`, {
      method: "PUT",
      body: chunk1,
    });
    expect(part1Res.status).toBe(200);
    expect((await json<PartResponse>(part1Res)).nextPartNumber).toBe(2);

    const statusRes = await app.request(`/assets/${init.assetId}`);
    expect((await json<StatusResponse>(statusRes)).receivedParts).toEqual([1]);

    const part2Res = await app.request(`/assets/${init.assetId}/parts/2`, {
      method: "PUT",
      body: chunk2,
    });
    expect(part2Res.status).toBe(200);

    const completeRes = await app.request(`/assets/${init.assetId}/complete`, { method: "POST" });
    expect(completeRes.status).toBe(200);
    const complete = await json<CompleteResponse>(completeRes);
    expect(complete.verified).toBe(true);
    expect(complete.sha256).toBe(sha256);
  });

  it("rejects a part uploaded out of order", async () => {
    const app = createApp(new MemoryVaultStore());
    const bytes = new TextEncoder().encode("short clip");
    const sha256 = sha256Hex(bytes);

    const initRes = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "audio", sha256 }),
    });
    const init = await json<InitAssetResponse>(initRes);

    // server expects part 1 next, sending part 2 should get bounced
    const res = await app.request(`/assets/${init.assetId}/parts/2`, { method: "PUT", body: bytes });
    expect(res.status).toBe(409);
  });

  it("flags a sha256 mismatch instead of silently accepting it", async () => {
    const app = createApp(new MemoryVaultStore());
    const bytes = new TextEncoder().encode("short clip");
    const wrongSha256 = "0".repeat(64);

    const initRes = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "audio", sha256: wrongSha256 }),
    });
    const init = await json<InitAssetResponse>(initRes);

    await app.request(`/assets/${init.assetId}/parts/1`, { method: "PUT", body: bytes });
    const completeRes = await app.request(`/assets/${init.assetId}/complete`, { method: "POST" });
    expect(completeRes.status).toBe(409);

    const statusRes = await app.request(`/assets/${init.assetId}`);
    expect((await json<StatusResponse>(statusRes)).status).toBe("failed");
  });

  it("rejects an init request with a bad kind", async () => {
    const app = createApp(new MemoryVaultStore());
    const res = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "video", sha256: "a".repeat(64) }),
    });
    expect(res.status).toBe(400);
  });

  it("404s on an asset that was never created", async () => {
    const app = createApp(new MemoryVaultStore());
    const res = await app.request("/assets/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("logs an audit event for every mutation and read, chain stays valid", async () => {
    const app = createApp(new MemoryVaultStore());
    const bytes = new TextEncoder().encode("short clip");
    const sha256 = sha256Hex(bytes);

    const initRes = await app.request("/captures/cap_1/assets", {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor-id": "resp_1", "x-actor-role": "fire" },
      body: JSON.stringify({ kind: "audio", sha256 }),
    });
    const init = await json<InitAssetResponse>(initRes);

    await app.request(`/assets/${init.assetId}/parts/1`, { method: "PUT", body: bytes });
    await app.request(`/assets/${init.assetId}`);
    await app.request(`/assets/${init.assetId}/complete`, { method: "POST" });

    const auditRes = await app.request("/_audit");
    const audit = await json<AuditResponse>(auditRes);

    expect(audit.verified.valid).toBe(true);
    // init, part, view, complete = 4. the GET /_audit call logs its own view too, but
    // after it's already taken the snapshot, so it shows up on the *next* call, not this one
    expect(audit.events.length).toBe(4);
    expect(audit.events[0]!.actorId).toBe("resp_1");
    expect(audit.events[0]!.recordId).toBe(init.assetId);
    expect(audit.events.some((e) => e.action === "view")).toBe(true);
    expect(audit.events.some((e) => e.action === "vault_access")).toBe(true);
  });
});
