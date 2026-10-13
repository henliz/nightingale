import { z } from "zod";
import { IsoDateTime } from "./common.js";

export const AccessTier = z.enum(["fire", "paramedic", "ed"]);
export type AccessTier = z.infer<typeof AccessTier>;

export const AccessGrant = z.object({
  noteId: z.string(),
  orgId: z.string(),
  tier: AccessTier,
  expiresAt: IsoDateTime.optional(),
});
export type AccessGrant = z.infer<typeof AccessGrant>;

export const HoldReason = z.enum([
  "death",
  "police_coroner",
  "complaint",
  "access_request",
  "grievance",
  "litigation",
]);
export type HoldReason = z.infer<typeof HoldReason>;

export const Hold = z.object({
  id: z.string(),
  scope: z.object({
    incidentId: z.string().optional(),
    captureId: z.string().optional(),
  }),
  reason: HoldReason,
  placedBy: z.string(),
  placedAt: IsoDateTime,
  releasedAt: IsoDateTime.optional(),
});
export type Hold = z.infer<typeof Hold>;
