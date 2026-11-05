import type { AuditEvent } from "@nightingale/schema";
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { dirname } from "node:path";

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

/**
 * Small append-only JSONL store for the MVP. It is intentionally boring: each
 * event is fsynced before append() resolves, and there is no update/delete API.
 * Production deployments should move this behind a transactional database or
 * managed immutable log with restricted operators and backups.
 */
export class FileAuditStore implements AuditStore {
  private readonly file: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(file: string) {
    this.file = file;
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    if (!existsSync(file)) writeFileSync(file, "", { mode: 0o600 });
    chmodSync(file, 0o600);
  }

  private readEvents(): AuditEvent[] {
    const text = readFileSync(this.file, "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditEvent);
  }

  async append(event: AuditEvent) {
    this.writeChain = this.writeChain.then(async () => {
      const fd = openSync(this.file, "a", 0o600);
      try {
        const line = Buffer.from(`${JSON.stringify(event)}\n`);
        writeSync(fd, line, 0, line.length);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      chmodSync(this.file, 0o600);
    });
    await this.writeChain;
  }

  async list() {
    await this.writeChain;
    return this.readEvents();
  }

  async last() {
    const events = await this.list();
    return events.at(-1);
  }
}
