# @nightingale/pipeline

milestone 3 done: fake adapters, wired audio to draft note end to end.

- `interfaces.ts`: `Transcriber`, `Diarizer`, `Condenser`, `PhotoPass`, same shapes as ARCHITECTURE.md section 8
- `fake-adapters.ts`: deterministic stand ins, no real transcription or LLM yet (that's **milestone 8**). `FakeCondenser` only ever echoes transcript text back verbatim, so it structurally can't produce an `unsupported_claim`, everything it says is already in the transcript
- `pipeline.ts`: `runPipeline()` wires transcribe -> diarize -> condense together
- `eval.ts`: `factRecallScore()`, a rough string-matching stand in for the real evaluation harness (word error rate needs a real transcriber to compare against, that's milestone 8 too)

tested against `@nightingale/fixtures`: both scenarios run through the full fake pipeline and get scored for fact recall. worth knowing: the mva scenario's patient is unconscious, so there's no patient speech at all, the responder's own narration carries the facts. the condenser has to fold responder speech into the note too, not just patient speech, or it drops everything in that case.
