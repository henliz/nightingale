import { DraftNote } from "@nightingale/schema";
import { z } from "zod";

/** One speaker-labelled line from a saved chunk (`LiveAsset.transcript` in packages/api). */
export const LiveLine = z.object({
  speaker: z.string(),
  text: z.string(),
  nonResponder: z.boolean().optional(),
  at: z.number().optional(),
});
export type LiveLine = z.infer<typeof LiveLine>;

export const LiveAsset = z.object({
  assetId: z.string(),
  captureId: z.string(),
  kind: z.enum(["audio", "photo"]),
  completedAt: z.number(),
  status: z.enum(["processing", "ready", "failed", "silent", "live"]),
  capturedAt: z.number().optional(),
  transcript: z.array(LiveLine).optional(),
  durationMs: z.number().optional(),
  caption: z.string().optional(),
  file: z.string().optional(),
});
export type LiveAsset = z.infer<typeof LiveAsset>;

/** `GET /dev/sessions` entry (`DrillSession` in packages/api). Only what the dashboard reads. */
export const DrillSession = z.object({
  captureId: z.string(),
  dir: z.string(),
  deviceId: z.string().optional(),
  startedAt: z.number(),
  title: z.string().optional(),
  assets: z.array(LiveAsset),
  epcr: DraftNote.optional(),
  epcrStatus: z.enum(["updating", "ready", "failed"]).optional(),
  epcrUpdatedAt: z.number().optional(),
  speakers: z.array(z.string()).optional(),
});
export type DrillSession = z.infer<typeof DrillSession>;
