import { z } from "zod";
import { IsoDateTime } from "./common.js";

export const CaptureMode = z.enum(["wearable", "app", "form"]);
export type CaptureMode = z.infer<typeof CaptureMode>;

export const CaptureStatus = z.enum([
  "uploading",
  "processing",
  "draft",
  "approved",
  "rejected",
]);
export type CaptureStatus = z.infer<typeof CaptureStatus>;

export const AssetKind = z.enum(["audio", "photo"]);
export type AssetKind = z.infer<typeof AssetKind>;

export const PhotoPurpose = z.enum(["medical", "fire_investigation"]);
export type PhotoPurpose = z.infer<typeof PhotoPurpose>;

export const Asset = z.object({
  id: z.string(),
  captureId: z.string(),
  kind: AssetKind,
  vaultKey: z.string(),
  sha256: z.string().length(64),
  capturedAt: IsoDateTime,
  photoPurpose: PhotoPurpose.optional(),
  facesBlurred: z.boolean().optional(),
  healthNumberFlagged: z.boolean().optional(),
});
export type Asset = z.infer<typeof Asset>;

export const Capture = z.object({
  id: z.string(),
  incidentId: z.string(),
  orgId: z.string(),
  responderId: z.string(),
  deviceId: z.string().optional(),
  mode: CaptureMode,
  startedAt: IsoDateTime,
  durationSec: z.number().nonnegative().optional(),
  /** audio + photos, these live in the sealed vault */
  assets: z.array(Asset),
  status: CaptureStatus,
});
export type Capture = z.infer<typeof Capture>;
