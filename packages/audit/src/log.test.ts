import { describe, expect, it } from "vitest";
import { GENESIS_HASH } from "./hash.js";
import { createAuditLog, verifyChain } from "./log.js";
import { MemoryAuditStore } from "./store.js";

describe("audit log", () => {
  it("chains each event's prevHash to the one before it", async () => {
    const log = createAuditLog(new MemoryAuditStore());
    const e1 = await log.record({
      actorId: "resp_1",
      actorRole: "fire_responder",
      action: "vault_access",
      recordType: "Asset",
      recordId: "asset_1",
    });
    const e2 = await log.record({
      actorId: "resp_1",
      actorRole: "fire_responder",
      action: "view",
      recordType: "Asset",
      recordId: "asset_1",
    });

    expect(e1.prevHash).toBe(GENESIS_HASH);
    expect(e2.prevHash).toBe(e1.hash);
  });

  it("verifies clean on an untouched chain, including an empty one", async () => {
    expect(verifyChain([])).toEqual({ valid: true });

    const log = createAuditLog(new MemoryAuditStore());
    await log.record({ actorId: "a", actorRole: "r", action: "view", recordType: "Asset", recordId: "x" });
    await log.record({ actorId: "a", actorRole: "r", action: "edit", recordType: "Asset", recordId: "x" });
    await log.record({ actorId: "a", actorRole: "r", action: "approve", recordType: "Asset", recordId: "x" });

    expect((await log.verify()).valid).toBe(true);
  });

  it("catches a field edited after the fact", async () => {
    const log = createAuditLog(new MemoryAuditStore());
    await log.record({ actorId: "a", actorRole: "r", action: "view", recordType: "Asset", recordId: "x" });
    await log.record({ actorId: "a", actorRole: "r", action: "edit", recordType: "Asset", recordId: "x" });
    await log.record({ actorId: "a", actorRole: "r", action: "approve", recordType: "Asset", recordId: "x" });

    const events = await log.list();
    const tampered = events.map((e, i) => (i === 1 ? { ...e, actorId: "someone_else" } : e));

    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.brokenAtIndex).toBe(1);
  });

  it("catches an event spliced out of the chain", async () => {
    const log = createAuditLog(new MemoryAuditStore());
    await log.record({ actorId: "a", actorRole: "r", action: "view", recordType: "Asset", recordId: "x" });
    await log.record({ actorId: "a", actorRole: "r", action: "edit", recordType: "Asset", recordId: "x" });
    await log.record({ actorId: "a", actorRole: "r", action: "approve", recordType: "Asset", recordId: "x" });

    const events = await log.list();
    const withOneRemoved = [events[0]!, events[2]!];

    const result = verifyChain(withOneRemoved);
    expect(result.valid).toBe(false);
    expect(result.brokenAtIndex).toBe(1);
  });
});
