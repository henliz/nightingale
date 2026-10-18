import type { DraftNote, Transcript } from "@nightingale/schema";

// everything behind an interface so a real provider can swap in later (milestone 8)
// without touching the rest of the pipeline. uses Uint8Array instead of node's Buffer
// so this stays portable if a stage ever needs to run outside node

// a raw transcriber doesn't know the captureId, that gets stitched on by the pipeline
// once it assembles the full Transcript record
export interface RawSegment {
  start: number;
  end: number;
  speaker: string;
  text: string;
  confidence: number;
}

export interface TranscribeResult {
  provider: string;
  modelVersion: string;
  segments: RawSegment[];
}

/** a voice the transcriber should recognise by name, e.g. "Person 1" + a 2-10 s wav clip */
export interface KnownSpeaker {
  name: string;
  /** "data:audio/wav;base64,..." */
  reference: string;
}

export interface TranscribeOptions {
  vocab?: string[];
  /** keeps speaker labels consistent across chunks, only diarizing transcribers use it */
  knownSpeakers?: KnownSpeaker[];
}

export interface Transcriber {
  transcribe(audio: Uint8Array, opts?: TranscribeOptions): Promise<TranscribeResult>;
}

export interface Diarizer {
  flagNonResponder(transcript: Transcript, knownResponderSpeakers?: string[]): Promise<Transcript>;
}

export interface IncidentContext {
  captureId: string;
  modelVersion: string;
  promptVersion: string;
}

export interface Condenser {
  condense(transcript: Transcript, ctx: IncidentContext): Promise<DraftNote>;
}

export interface PhotoPassResult {
  image: Uint8Array;
  facesBlurred: boolean;
  healthNumberFlagged: boolean;
}

export interface PhotoPass {
  process(image: Uint8Array): Promise<PhotoPassResult>;
}

// separate from PhotoPass on purpose: PhotoPass is about safety processing (blur,
// health number detection), this is just "describe what's in it" for the dashboard
export interface PhotoCaptioner {
  caption(image: Uint8Array): Promise<string>;
}
