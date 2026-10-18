# read this before reviewing this session

the "dispatch, this is unit 5" radio call, the hospital-name lists, and the patient
vitals in this session's transcript and ePCR are **not real audio**. nobody said them
and the pi was not listening to any radio or dispatcher (it only records its own mic,
via arecord). during this session only typing was happening near the mic.

they were invented by the transcription model (gpt-4o-transcribe) from a vocabulary
prompt that listed ems terms and local hospital names. on near-silent audio the model
filled the silence with that prompt. the prompt was removed on 2026-10-17 at about
7 pm, see packages/pipeline/src/real-adapters.ts.

treat everything transcribed in this session before that fix as fabricated.
