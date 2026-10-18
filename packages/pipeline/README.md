# @nightingale/pipeline

milestone 3 done: fake adapters, wired audio to draft note end to end.

- `interfaces.ts`: `Transcriber`, `Diarizer`, `Condenser`, `PhotoPass`, same shapes as ARCHITECTURE.md section 8
- `fake-adapters.ts`: deterministic stand ins. `FakeCondenser` only ever echoes transcript text back verbatim, so it structurally can't produce an `unsupported_claim`, everything it says is already in the transcript
- `real-adapters.ts`: `OpenAITranscriber`, a real speech to text adapter against openai's transcription endpoint. whisper doesn't diarize, so every segment gets labelled `"responder"` for now, that's fine for a one person demo but isn't real diarization. diarizer and condenser stay fake even when this is wired in, that part's still **milestone 8**
- `pipeline.ts`: `runPipeline()` wires transcribe -> diarize -> condense together, works with either adapter set
- `eval.ts`: `factRecallScore()`, a rough string-matching stand in for the real evaluation harness (word error rate needs hand written correct transcripts to compare against, that's milestone 8 too)

tested against `@nightingale/fixtures`: both scenarios run through the full fake pipeline and get scored for fact recall. worth knowing: the mva scenario's patient is unconscious, so there's no patient speech at all, the responder's own narration carries the facts. the condenser has to fold responder speech into the note too, not just patient speech, or it drops everything in that case.
