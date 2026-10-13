import { createHash } from "node:crypto";
import type { AuditEvent } from "@nightingale/schema";

// first event in the chain points back to this instead of a real hash
export const GENESIS_HASH = "0".repeat(64);

// fixed field order on purpose, so the hash doesn't depend on how the caller built the object
function canonicalString(event: Omit<AuditEvent, "hash">): string {
  return JSON.stringify({
    id: event.id,
    ts: event.ts,
    actorId: event.actorId,
    actorRole: event.actorRole,
    action: event.action,
    recordType: event.recordType,
    recordId: event.recordId,
    reason: event.reason ?? null,
    prevHash: event.prevHash,
  });
}

export function computeHash(event: Omit<AuditEvent, "hash">): string {
  return createHash("sha256").update(canonicalString(event)).digest("hex");
}
