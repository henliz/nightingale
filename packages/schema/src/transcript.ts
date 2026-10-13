import { z } from "zod";

export const TranscriptSegment = z.object({
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  speaker: z.string(),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  /** true if this is bystander/family/some other non-responder voice, needs redaction review */
  nonResponder: z.boolean().optional(),
});
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;

export const Transcript = z.object({
  id: z.string(),
  captureId: z.string(),
  provider: z.string(),
  modelVersion: z.string(),
  segments: z.array(TranscriptSegment),
});
export type Transcript = z.infer<typeof Transcript>;
