import { randomUUID } from "node:crypto";
import { AuditEvent, type AuditAction } from "@nightingale/schema";
import { computeHash, GENESIS_HASH } from "./hash.js";
import type { AuditStore } from "./store.js";

export interface RecordInput {
  actorId: string;
  actorRole: string;
  action: AuditAction;
  recordType: string;
  recordId: string;
  reason?: string;
}

export interface VerifyResult {
  valid: boolean;
  brokenAtIndex?: number;
  reason?: string;
}

// pure on purpose, no store needed, so a test can tamper with a plain array and
// check it gets caught without wiring up a whole log instance
export function verifyChain(events: AuditEvent[]): VerifyResult {
  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;

    if (event.prevHash !== expectedPrevHash) {
      return { valid: false, brokenAtIndex: i, reason: `event ${event.id} doesn't link to the prior event` };
    }

    const { hash, ...rest } = event;
    if (computeHash(rest) !== hash) {
      return { valid: false, brokenAtIndex: i, reason: `event ${event.id} doesn't match its own hash` };
    }

    expectedPrevHash = hash;
  }

  return { valid: true };
}

// wires record() to an actual store. every api mutation and read goes through record(),
// see ARCHITECTURE.md section 12 milestone 2 and section 2 "every view, edit, approval,
// export and deletion is logged"
export function createAuditLog(store: AuditStore) {
  async function record(input: RecordInput): Promise<AuditEvent> {
    const prev = await store.last();
    const prevHash = prev?.hash ?? GENESIS_HASH;

    const base = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.action,
      recordType: input.recordType,
      recordId: input.recordId,
      reason: input.reason,
      prevHash,
    };

    const event = AuditEvent.parse({ ...base, hash: computeHash(base) });
    await store.append(event);
    return event;
  }

  async function list() {
    return store.list();
  }

  async function verify() {
    return verifyChain(await store.list());
  }

  return { record, list, verify };
}
