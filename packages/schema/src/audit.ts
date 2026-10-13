import { z } from "zod";
import { IsoDateTime } from "./common.js";

export const AuditAction = z.enum([
  "view",
  "edit",
  "approve",
  "export",
  "delete",
  "vault_access",
  "break_glass",
  "hold",
]);
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditEvent = z.object({
  id: z.string(),
  ts: IsoDateTime,
  actorId: z.string(),
  actorRole: z.string(),
  action: AuditAction,
  recordType: z.string(),
  recordId: z.string(),
  reason: z.string().optional(),
  /** hash chain stuff, prevHash points to the last event, hash covers this event + prevHash */
  prevHash: z.string(),
  hash: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;
