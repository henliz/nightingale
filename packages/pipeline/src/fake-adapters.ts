import { DraftNote, type NoteFlag, type NoteSections, type NoteSpan, type Transcript } from "@nightingale/schema";
import type {
  Condenser,
  Diarizer,
  IncidentContext,
  PhotoPass,
  PhotoPassResult,
  RawSegment,
  Transcriber,
  TranscribeResult,
} from "./interfaces.js";

// stand in for a real transcription provider (milestone 8). there's no recorded audio
// in v0 (@nightingale/fixtures README), so "audio" here is just the json-encoded
// segments a real transcriber would have produced, fed straight back out
export class FakeTranscriber implements Transcriber {
  async transcribe(audio: Uint8Array): Promise<TranscribeResult> {
    const segments: RawSegment[] = JSON.parse(new TextDecoder().decode(audio));
    return { provider: "fake-transcriber", modelVersion: "fake-1", segments };
  }
}

// real diarization (milestone 8) would use actual speaker embeddings. this just trusts
// the speaker label already on the segment, fine for drills where speakers are labelled
// "responder" / "patient" / "bystander" etc
export class FakeDiarizer implements Diarizer {
  async flagNonResponder(
    transcript: Transcript,
    knownResponderSpeakers: string[] = ["responder", "patient"],
  ): Promise<Transcript> {
    return {
      ...transcript,
      segments: transcript.segments.map((segment) => ({
        ...segment,
        nonResponder: knownResponderSpeakers.includes(segment.speaker) ? undefined : true,
      })),
    };
  }
}

// doesn't do any actual distilling, just echoes transcript text back into sections
// verbatim. that's on purpose: it can't hallucinate an unsupported_claim because it
// never says anything that isn't already in the transcript. the real condenser
// (milestone 8) is where the actual summarizing happens
export class FakeCondenser implements Condenser {
  async condense(transcript: Transcript, ctx: IncidentContext): Promise<DraftNote> {
    // narration = responder + patient speech, whoever's actually describing the scene.
    // when the patient can't talk (unconscious, etc) the responder IS the narration,
    // so this can't be "patient speaker only", that drops everything in that scenario
    const narrationLines: string[] = [];
    const narrationRefs: string[] = [];
    const bystanderLines: string[] = [];
    const bystanderRefs: string[] = [];
    const flags: NoteFlag[] = [];

    transcript.segments.forEach((segment, i) => {
      const ref = `segment[${i}]`;
      if (segment.nonResponder) {
        bystanderLines.push(segment.text);
        bystanderRefs.push(ref);
        flags.push({
          type: "non_responder_speech",
          ref,
          note: `${segment.speaker} speech, review before approval`,
        });
      } else {
        narrationLines.push(segment.text);
        narrationRefs.push(ref);
      }
    });

    const sections: NoteSections = {};
    const spans: NoteSpan[] = [];

    if (narrationLines.length > 0) {
      sections.mechanismOrComplaint = narrationLines.join(" ");
      spans.push({ field: "sections.mechanismOrComplaint", transcriptSegmentIds: narrationRefs });
    }
    if (bystanderLines.length > 0) {
      sections.bystanderStatements = bystanderLines.join(" ");
      spans.push({ field: "sections.bystanderStatements", transcriptSegmentIds: bystanderRefs });
    }

    return DraftNote.parse({
      id: crypto.randomUUID(),
      captureId: ctx.captureId,
      modelVersion: ctx.modelVersion,
      promptVersion: ctx.promptVersion,
      sections,
      spans,
      flags,
    });
  }
}

// doesn't blur anything or actually detect health numbers, that's real cv work for
// milestone 8. just proves the interface shape so the rest of the pipeline can wire
// against it now
export class FakePhotoPass implements PhotoPass {
  async process(image: Uint8Array): Promise<PhotoPassResult> {
    return { image, facesBlurred: true, healthNumberFlagged: false };
  }
}
