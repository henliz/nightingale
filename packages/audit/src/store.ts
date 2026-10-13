import type { AuditEvent } from "@nightingale/schema";

// append only, on purpose, nothing in here ever needs an update or delete method
export interface AuditStore {
  append(event: AuditEvent): Promise<void>;
  list(): Promise<AuditEvent[]>;
  last(): Promise<AuditEvent | undefined>;
}

// in memory, for tests and for now. durable storage (postgres) is a later milestone,
// same story as the upload session tracker in packages/api
export class MemoryAuditStore implements AuditStore {
  private events: AuditEvent[] = [];

  async append(event: AuditEvent) {
    this.events.push(event);
  }

  async list() {
    return [...this.events];
  }

  async last() {
    return this.events[this.events.length - 1];
  }
}
