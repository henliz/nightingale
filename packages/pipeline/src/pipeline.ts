import { Transcript, type DraftNote } from "@nightingale/schema";
import type { Condenser, Diarizer, Transcriber } from "./interfaces.js";

export interface PipelineDeps {
  transcriber: Transcriber;
  diarizer: Diarizer;
  condenser: Condenser;
}

export interface RunPipelineInput {
  captureId: string;
  audio: Uint8Array;
  modelVersion: string;
  promptVersion: string;
  vocab?: string[];
}

export interface RunPipelineResult {
  transcript: Transcript;
  draftNote: DraftNote;
}

// audio in, draft note out. transcribe -> diarize -> condense, see ARCHITECTURE.md
// section 8. swap in real adapters later without touching this function at all
export async function runPipeline(deps: PipelineDeps, input: RunPipelineInput): Promise<RunPipelineResult> {
  const raw = await deps.transcriber.transcribe(input.audio, { vocab: input.vocab });

  const transcript = Transcript.parse({
    id: crypto.randomUUID(),
    captureId: input.captureId,
    provider: raw.provider,
    modelVersion: raw.modelVersion,
    segments: raw.segments,
  });

  const diarized = await deps.diarizer.flagNonResponder(transcript);

  const draftNote = await deps.condenser.condense(diarized, {
    captureId: input.captureId,
    modelVersion: input.modelVersion,
    promptVersion: input.promptVersion,
  });

  return { transcript: diarized, draftNote };
}
