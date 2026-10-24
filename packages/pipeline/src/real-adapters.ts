import { DraftNote, NoteSections, type NoteFlag, type NoteSpan, type Transcript } from "@nightingale/schema";
import type {
  Condenser,
  IncidentContext,
  PhotoCaptioner,
  RawSegment,
  TranscribeOptions,
  TranscribeResult,
  Transcriber,
} from "./interfaces.js";

export interface OpenAITranscriberConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** digital gain applied before sending to whisper, in dB. default 15, see boostWavGain */
  gainDb?: number;
}

interface OpenAIVerboseSegment {
  start: number;
  end: number;
  text: string;
}

interface OpenAIVerboseResponse {
  text: string;
  segments?: OpenAIVerboseSegment[];
}

// scans a pcm16 mono/stereo wav for its "data" chunk instead of assuming a fixed
// 44 byte header, since some encoders add extra chunks before the audio starts
function findWavDataChunk(bytes: Uint8Array): { offset: number; length: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12; // past "RIFF" (4) + size (4) + "WAVE" (4)
  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === "data") return { offset: offset + 8, length: chunkSize };
    offset += 8 + chunkSize + (chunkSize % 2); // chunks are word-aligned, pad byte if odd
  }
  return null;
}

// a wav whose recording got cut off (pi lost power mid-chunk) still has the placeholder
// header arecord/the daemon wrote at the start: data length 0 (or 0xffffffff). openai
// rejects those ("does not support the format"), so set the sizes from what's actually
// in the file. returns a fixed copy, or the same bytes if they were fine
export function repairWav(bytes: Uint8Array): Uint8Array {
  const data = findWavDataChunk(bytes);
  if (!data || bytes.length < 44) return bytes;
  const actual = (bytes.length - data.offset) & ~1;
  if (data.length === actual || (data.length > 0 && data.offset + data.length <= bytes.length)) return bytes;
  const out = bytes.slice(0, data.offset + actual);
  const view = new DataView(out.buffer);
  view.setUint32(4, out.length - 8, true);
  view.setUint32(data.offset - 4, actual, true);
  return out;
}

/** the raw pcm of a 16-bit wav and its sample rate, null if it's not a wav we can read */
export function wavPcm(bytes: Uint8Array): { pcm: Uint8Array; rate: number } | null {
  const fixed = repairWav(bytes);
  const data = findWavDataChunk(fixed);
  if (!data || fixed.length < 44) return null;
  const view = new DataView(fixed.buffer, fixed.byteOffset, fixed.byteLength);
  const end = Math.min(fixed.length, data.offset + data.length);
  return { pcm: fixed.subarray(data.offset, end - ((end - data.offset) % 2)), rate: view.getUint32(24, true) || 16000 };
}

/** seconds of audio actually in a 16-bit wav (after repairWav), null if it's not a wav */
export function wavSeconds(bytes: Uint8Array): number | null {
  if (bytes.length < 44 || String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF") return null;
  const data = findWavDataChunk(bytes);
  if (!data) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rate = view.getUint32(24, true) || 16000;
  const channels = view.getUint16(22, true) || 1;
  const len = Math.min(data.length, bytes.length - data.offset);
  return len / (rate * channels * 2);
}

// how loud is this clip: rms of its loudest 1s window, in dBFS (0 = full scale, the pi
// mic's room-tone floor sits around -68). null if it's not a 16-bit wav we can read.
// used to skip transcribing silent chunks, whisper invents text out of silence
// ("Keyboard, Mouse, MacbookPro" etc) and then the condenser builds a note on it
export function wavLoudestSecondDbfs(bytes: Uint8Array): number | null {
  const dataChunk = findWavDataChunk(bytes);
  if (!dataChunk || bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = view.getUint32(24, true) || 16000;
  // arecord cut off mid-write leaves a bogus data length, clamp to what's actually there
  const end = Math.min(bytes.length, dataChunk.offset + dataChunk.length);
  const sampleCount = Math.floor((end - dataChunk.offset) / 2);
  if (sampleCount === 0) return null;

  let loudest = 0;
  for (let start = 0; start < sampleCount; start += sampleRate) {
    const stop = Math.min(sampleCount, start + sampleRate);
    let sumSq = 0;
    for (let i = start; i < stop; i++) {
      const sample = view.getInt16(dataChunk.offset + i * 2, true);
      sumSq += sample * sample;
    }
    loudest = Math.max(loudest, Math.sqrt(sumSq / (stop - start)));
  }
  return 20 * Math.log10(Math.max(loudest, 1) / 32768);
}

// digital gain boost, applied only in memory right before this goes to whisper, never
// touching what's actually stored in the vault (the sha256 check in packages/api already
// ran against the real raw bytes before this ever gets called). tested against a real
// quiet mic recording: +15db recovered speech that was otherwise too quiet to transcribe,
// with zero clipping. pushing well past that didn't recover more, the rest was below the
// noise floor, not just quiet, so this helps at the margin, it's not a fix for a mic
// that's fundamentally too far from what it's listening to
export function boostWavGain(bytes: Uint8Array, gainDb: number): Uint8Array {
  const dataChunk = findWavDataChunk(bytes);
  if (!dataChunk) return bytes; // not a wav we recognize, leave it alone

  const multiplier = 10 ** (gainDb / 20);
  const out = new Uint8Array(bytes); // copy, never mutate the caller's buffer
  const outView = new DataView(out.buffer);
  // a recording cut off mid-write (or arecord's placeholder header) can claim more data
  // than the file holds, which crashed this with "offset is outside the bounds"
  const end = Math.min(out.length, dataChunk.offset + dataChunk.length);
  const sampleCount = Math.max(0, Math.floor((end - dataChunk.offset) / 2));

  for (let i = 0; i < sampleCount; i++) {
    const pos = dataChunk.offset + i * 2;
    const sample = outView.getInt16(pos, true);
    const boosted = Math.max(-32768, Math.min(32767, Math.round(sample * multiplier)));
    outView.setInt16(pos, boosted, true);
  }
  return out;
}

// true if a segment is mostly words from the prompt, i.e. the model parroted the prompt
// back instead of transcribing (it does this on silence)
function echoesPrompt(text: string, vocab?: string[]): boolean {
  if (!vocab?.length) return false;
  const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  if (words.length === 0) return false;
  const vocabWords = new Set(vocab.join(" ").toLowerCase().match(/[a-z0-9']+/g) ?? []);
  return words.filter((w) => vocabWords.has(w)).length / words.length > 0.7;
}

// brings a quiet recording up so its loudest second sits near -20 dBFS (max +30 dB).
// the pi's mic records far too quietly for any model to hear well. a copy, in memory
// only, what's stored in the vault never changes
export function normalizeWav(bytes: Uint8Array, targetDbfs = -20, maxGainDb = 30): Uint8Array {
  const level = wavLoudestSecondDbfs(bytes);
  if (level === null) return bytes;
  const gainDb = Math.max(0, Math.min(maxGainDb, targetDbfs - level));
  return gainDb > 0.5 ? boostWavGain(bytes, gainDb) : bytes;
}

// a standalone 16-bit wav of one stretch of another one, for speaker reference clips
export function wavSlice(bytes: Uint8Array, startSec: number, endSec: number): Uint8Array | null {
  const data = findWavDataChunk(bytes);
  if (!data || bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rate = view.getUint32(24, true) || 16000;
  const channels = view.getUint16(22, true) || 1;
  const frame = 2 * channels;
  const end = Math.min(bytes.length, data.offset + data.length);
  const from = Math.max(data.offset, data.offset + Math.floor(startSec * rate) * frame);
  const to = Math.min(end, data.offset + Math.floor(endSec * rate) * frame);
  if (to <= from) return null;
  const out = new Uint8Array(44 + (to - from));
  out.set(bytes.subarray(0, 44));
  out.set(bytes.subarray(from, to), 44);
  const outView = new DataView(out.buffer);
  outView.setUint32(4, 36 + (to - from), true);
  outView.setUint32(40, to - from, true);
  return out;
}

interface DiarizedResponse {
  text?: string;
  segments?: { speaker?: string; text?: string; start?: number; end?: number }[];
}

// speaker-labelled transcription of a saved chunk (oct 17 2026). the live word-by-word
// model can't tell voices apart, this one can: it returns segments tagged with a speaker,
// and when given short reference clips of voices it's already heard ("Person 1", ...)
// it reuses those names, so labels stay the same from chunk to chunk. up to 4 known
// voices per request (api limit). no prompt support, english isn't forced (the api
// doesn't take language for this model)
export class OpenAIDiarizedTranscriber implements Transcriber {
  private model: string;
  private baseUrl: string;

  constructor(private readonly config: { apiKey: string; model?: string; baseUrl?: string }) {
    this.model = config.model ?? "gpt-4o-transcribe-diarize";
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  }

  async transcribe(audio: Uint8Array, opts?: TranscribeOptions): Promise<TranscribeResult> {
    const form = new FormData();
    form.append("file", new Blob([normalizeWav(audio)], { type: "audio/wav" }), "chunk.wav");
    form.append("model", this.model);
    form.append("response_format", "diarized_json");
    form.append("chunking_strategy", "auto");
    for (const speaker of (opts?.knownSpeakers ?? []).slice(0, 4)) {
      form.append("known_speaker_names[]", speaker.name);
      form.append("known_speaker_references[]", speaker.reference);
    }

    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: form,
    });
    if (!res.ok) throw new Error(`openai diarized transcription failed: ${res.status} ${await res.text()}`);

    const body = (await res.json()) as DiarizedResponse;
    const segments: RawSegment[] = (body.segments ?? [])
      .filter((seg) => seg.text?.trim())
      .map((seg) => ({
        start: seg.start ?? 0,
        end: seg.end ?? 0,
        speaker: seg.speaker ?? "unknown",
        text: seg.text!.trim(),
        confidence: 1,
      }));
    return { provider: "openai", modelVersion: this.model, segments };
  }
}

// NOT sent by default anymore, see the comment in transcribe(). kept as a reference list
// for the evaluation harness, which scores whether these terms survive transcription.
// biases transcription toward the words a drill actually uses. not exhaustive, extend
// with street names / unit numbers for a given drill via the vocab option
export const DEFAULT_EMS_VOCAB = [
  "paramedic", "EMS", "CTAS", "GCS", "SpO2", "sats", "BP", "blood pressure", "heart rate",
  "resp rate", "glucose", "OPQRST", "SAMPLE", "LOC", "alert and oriented", "A and O times 3",
  "c-spine", "collar", "backboard", "scoop", "stretcher", "extrication", "Jaws of Life",
  "SCBA", "MVC", "fall", "syncope", "chest pain", "shortness of breath", "STEMI", "stroke",
  "FAST", "seizure", "overdose", "naloxone", "Narcan", "ASA", "aspirin", "nitro",
  "nitroglycerin", "Ventolin", "salbutamol", "EpiPen", "epinephrine", "Gravol", "fentanyl",
  "Tylenol", "Advil", "warfarin", "Eliquis", "metformin", "insulin", "allergies", "NKDA",
  "penicillin", "sulfa", "tourniquet", "AED", "CPR", "BVM", "oxygen", "non-rebreather",
  "nasal cannula", "Hamilton General", "St. Joseph's", "Juravinski", "Grand River Hospital",
  "St. Mary's", "Cambridge Memorial",
];

// real speech to text, via openai's transcription endpoint. uses global fetch/FormData/
// Blob, all built into node 22, no extra http client needed
//
// whisper doesn't diarize (no speaker id), so every segment gets labelled "responder"
// for now. fine for a one-person demo, telling real speakers apart is still real work,
// not done here (ARCHITECTURE.md section 8 calls this out as milestone 8)
export class OpenAITranscriber implements Transcriber {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private gainDb: number;

  constructor(config: OpenAITranscriberConfig) {
    this.apiKey = config.apiKey;
    // gpt-4o-transcribe over whisper-1 (oct 17 2026): noticeably fewer made-up lines on
    // quiet/noisy audio, same price. whisper-1 is still selectable, it's the only one
    // that returns timestamped segments
    this.model = config.model ?? "gpt-4o-transcribe";
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
    this.gainDb = config.gainDb ?? 15;
  }

  async transcribe(audio: Uint8Array, opts?: TranscribeOptions): Promise<TranscribeResult> {
    const boosted = boostWavGain(audio, this.gainDb);
    const form = new FormData();
    form.append("file", new Blob([boosted], { type: "audio/wav" }), "clip.wav");
    form.append("model", this.model);
    // forced, not auto-detected: on quiet audio whisper was "detecting" japanese and
    // returning text like "Keyboard、Mouse、MacbookPro"
    form.append("language", "en");
    form.append("temperature", "0");
    const isWhisper = this.model.startsWith("whisper");
    if (isWhisper) {
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "segment");
    } else {
      form.append("response_format", "json");
    }
    // NO default prompt. a vocab prompt (oct 17 2026) made the model fill quiet audio
    // with the prompt itself: whole chunks came back as the hospital list, or as an
    // invented "dispatch, this is unit 5" radio call built from the vocab words. the mic
    // was only hearing typing. a prompt is only sent when a caller passes vocab
    // explicitly, and anything that just echoes it gets dropped below
    if (opts?.vocab?.length) form.append("prompt", opts.vocab.join(", "));

    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!res.ok) {
      throw new Error(`openai transcription failed: ${res.status} ${await res.text()}`);
    }

    const body = (await res.json()) as OpenAIVerboseResponse;
    // the gpt-4o models only send back plain text, split it into sentences so the
    // transcript and the note's source spans still have something to point at
    const rawSegments =
      body.segments ??
      (body.text.match(/[^.!?]+[.!?]*/g) ?? [])
        .map((t) => t.trim())
        .filter(Boolean)
        .map((text) => ({ start: 0, end: 0, text }));
    const segments: RawSegment[] = rawSegments.filter((s) => !echoesPrompt(s.text, opts?.vocab)).map((s) => ({
      start: s.start,
      end: s.end,
      speaker: "responder",
      text: s.text.trim(),
      // whisper doesn't give a clean 0-1 confidence the way a diarization-first
      // provider would, this is a placeholder until a provider that does is wired in
      confidence: 1,
    }));

    // a very short clip can come back with text but no segments, don't drop it
    if (segments.length === 0 && body.text.trim().length > 0) {
      segments.push({ start: 0, end: 0, speaker: "responder", text: body.text.trim(), confidence: 1 });
    }

    return { provider: "openai", modelVersion: this.model, segments };
  }
}

export interface OpenAICondenserConfig {
  apiKey: string;
  model?: string;
  /** "none" | "low" | ..., the newer models think before answering, less = faster */
  reasoningEffort?: string;
  baseUrl?: string;
}

// uncertain items were plain strings up to v7, still accepted in case the model slips back
type ExtractedSections = Record<string, unknown> & { uncertain?: (string | { field?: string; note?: string })[] };

// v2 (oct 17 2026): fills the whole epcr shape, not just the handoff basics. the server
// runs this over the whole session's transcript so far, so the form keeps filling in
// and correcting itself as chunks land
//
// v4 (oct 19 2026): v3's "never infer" made it too timid. "hit on the driver's side, stuck
// in the truck, leg under the dash" came out as mechanism "leg entrapment" and no
// dispatch reason. now: restating + combining what was said in ems wording is the job,
// only adding facts nobody said is off limits
//
// v5 (oct 19 2026, after the field test): v4 wrote "L leg" when nobody said a side (it
// happened to be right, which is worse, it looks trustworthy), made up an "at
// destination" time, and dropped a bystander naming the patient and saying he was drunk.
// examples in here are placeholders on purpose: a real name used as an example got
// copied into a case where nobody said any name
//
// v6: the call's milestones (911 call, crew arrival, handoff) go into the time slots the
// form already has, and fields read like a medic charted them
//
// v7 (oct 20 2026, after the bbq/allergy/dirt bike cases): missed "give a call" as the
// 911 call, left # patients / capacity / decision maker blank when the scene made them
// obvious, and put where it hurts in radiation. times go to the second now, a drill fits
// in 6 minutes so hh:mm made every milestone the same minute
//
// v8 (oct 23 2026): each "uncertain" item says which field it's about, so the dashboard
// can outline that field red instead of the flag pointing at nothing
//
// v9 (oct 23 2026): the shellfish case charted "denies EpiPen" under medications and put
// EpiPen in the meds-mentioned list when he just doesn't carry one. things the patient
// doesn't have/take go in plain words in the history, never "denies", never as a med
export const CONDENSE_PROMPT_VERSION = "epcr-v9";

const CONDENSE_SYSTEM_PROMPT = `you fill in a draft ePCR (electronic patient care report) from a transcript of an emergency-response drill. a responder will review every field before anything is shared.

rules:
- write it like an experienced paramedic would: pull every fact that was said into the right field, restated in standard ems wording, combining what different people said about the same thing. e.g. "I was up the ladder cleaning the gutter" + "he came down maybe eight feet" + "landed flat on his back" -> mechanism "fall ~8 ft from ladder, landed on back"
- what's off limits is adding a fact nobody said: no diagnosis, no clinical impression, no treatment advice, no invented numbers, nothing because it "seems likely". restating and summarizing what was said is not inferring
- never fill in a body side (left/right), a time, a name, an age or a number that nobody said. a wrong side or time in a patient record is dangerous even when it's a good guess. if it matters and wasn't said (e.g. which leg), leave it out and add it to "uncertain"
- times: only use a line's "(hh:mm:ss)" for something happening at that moment, copied to the second. never fill transport/destination times unless arriving somewhere is actually described
- the call's milestones go in the time slots, using the "(hh:mm:ss)" of the line where they happen (in drills people narrate them, "we can say the ambulance is here", treat that as it happening):
  - the 911 call -> incident.times.callReceived: the line where the caller starts reporting to dispatch, or dispatch answering ("911, do you need..."). if the call itself isn't heard, the line where someone says to call ("let's call 911", "give a call")
  - "fire arriving", "we're on scene", a crew announcing arrival -> incident.times.onScene
  - the first responder starting to talk to or assess the patient -> incident.times.patientContact
  - "ambulance is here", "paramedics arriving", a transfer of care / handoff report -> transport.handoffTo (who to) plus an interventions entry "transfer of care to <who>" at that time
  - leaving the scene / arriving at hospital -> departScene / atDestination, only if it's described
- timeline: the key moments in order, each as "hh:mm:ss event" separated by "; " (call, arrival, patient contact, each intervention, handoff), in plain words ("911 call", not "callReceived")
- write every field the way a paramedic charts it: short clinical phrases with the body part, not fragments ("chest tightness" not "tightening", "pain 6/10" not "six")
- bystanders count for scene facts: a name they use for the patient ("my friend <name>") is the patient's name, and what they say about the patient or scene (e.g. intoxication, what happened, who else is around) goes in the matching field (sample.events, hazards, scene) as well as bystanderStatements
- bystanderStatements and any quotes must use the words actually said. never add a name, age or detail into a quote
- when people disagree (two different ages, two different times), the field holds each value with who said it ("32 per cousin; 57 per responder at handoff") and the conflict goes in "uncertain". never pick one
- fill every field the transcript supports, including the obvious one-word summaries a paramedic would write: dispatchReason is the call type that was described (what dispatch said if that's quoted, otherwise e.g. "fall", "MVC", "chest pain"), chiefComplaint is the patient's main problem with the body part and side ("R wrist pain"), hazards / environment / safety come from what's described about the scene
- other responders count: who's on scene and what they said or did goes in unitsOnScene / othersOnScene (e.g. "fire (Sam, firefighter), police"), a responder giving a report to another (a handoff) goes in the narrative, a radio report to command is an intervention/communication worth noting
- anything a responder reports about the patient (age, meds, time trapped, injuries) counts the same as the patient saying it
- lines are tagged with who spoke: [Person 1], [Person 2], ... are different voices, numbered in the order they were first heard (not by role). [unlabelled] means the speaker isn't known yet. work out who is the patient only from what they say (e.g. describing their own pain or history), and never put a "Person N" label in the form
- lines marked [bystander] are not the responder or patient, that content only goes in bystanderStatements
- vitals: only record a number if someone actually said it out loud (e.g. "bp 140 over 90", "sats 96"). never estimate one, and "no pulse" is hr "absent", not 0. qualitative findings (alert, pale, breathing fast) go in conditionObserved / physicalExam / vitals.loc / vitals.skin
- "(hh:mm:ss)" at the start of a line is the clock time that part was recorded. you may use it for a vitals/intervention/incident time when the speech is about that moment ("giving aspirin now"), otherwise leave times out
- interventions are things the responder actually did, each as its own entry, with the patient's response if it was said
- medications and allergies: only ones the patient actually takes or has, as said. also list them in medsAndAllergiesMentioned for the short handoff view
- something the patient doesn't have or take (no EpiPen, no blood thinners, no allergies) is a pertinent negative: write it in plain words ("doesn't carry an EpiPen", "no known allergies") in sample.pastHistory or sample.signsSymptoms where it fits. never write "denies", it reads like they refused something. never put it in medications or medsAndAllergiesMentioned
- a responder asking a yes/no question and moving on ("you don't carry an EpiPen? no? okay") is the responder's understanding, not the patient's answer. chart it the same way but don't quote the patient as saying it
- the transcript is speech-to-text and has errors. if a word or phrase is clearly a mis-hearing (an ems term, or an everyday phrase where one word is obviously misheard), use the obvious intended words, but if you're not sure, keep it out and add a short note to "uncertain"
- scene.numberOfPatients: the number of patients described. one person hurt or sick and nobody mentions another -> "1"
- patient.capacity is charted from what was said, the way a medic would, with the reasons in patient.capacityNote:
  - "incapable": unresponsive, pulseless, not answering, or clearly confused / disoriented
  - "impaired": answering but with something said that undermines it, e.g. intoxicated (even per bystanders), possible head strike, can't remember the event, dizzy / near syncope. list each reason said ("intoxicated per bystanders, ?head strike, can't recall event")
  - "capable": an adult, alert, answering questions appropriately, and nothing said that undermines it
  - pain on its own is not a capacity reason. only "unknown" if nothing about responsiveness or behaviour was said
- patient.decisionMaker: "self" when capable; when incapable or impaired, "implied consent (emergency)" plus any family / substitute decision maker on scene by their relation as said ("implied consent (emergency), cousin on scene")
- sex only if said or the speaker uses he/she about the patient
- opqrst.severity is the pain score ("seven out of ten"), and the same score goes in that moment's vitals row as pain. opqrst.quality is how it feels (sharp, dull, crushing)
- opqrst.radiation is ONLY pain spreading or moving from where it starts to somewhere else ("goes down my arm", "into my jaw"). where it hurts most / pointing at a spot is the location, that goes in chiefComplaint, not radiation. "doesn't go anywhere" -> "non-radiating". nothing said about spreading -> leave it out
- opqrst.provocation is what makes it better or worse (moving, breathing in, rest). a symptom isn't a provocation
- times are hh:mm:ss (24h), no brackets. in the timeline too
- each "uncertain" item is {"field": "<top-level key it's about>", "note": "<what's unsure>"}, field is one of the top-level keys in the shape below (e.g. "patient" for a name or age conflict, "vitals", "opqrst", "incident"). an age conflict -> field "patient"
- if a field has no information, leave it out of the json entirely. empty strings and empty arrays are not allowed
- respond with a single json object only, matching this shape, every field optional:
{"incident": {"location": "", "dispatchReason": "", "unitsOnScene": "", "times": {"callReceived": "", "enRoute": "", "onScene": "", "patientContact": "", "departScene": "", "atDestination": ""}},
 "scene": {"numberOfPatients": "", "environment": "", "safety": "", "othersOnScene": ""},
 "chiefComplaint": "", "mechanismOrComplaint": "", "timeline": "",
 "patient": {"name": "", "age": "", "sex": "", "dob": "", "weight": "", "capacity": "capable|impaired|incapable|unknown", "capacityNote": "", "decisionMaker": ""},
 "sample": {"signsSymptoms": "", "allergies": [""], "medications": [""], "pastHistory": "", "lastOralIntake": "", "events": ""},
 "opqrst": {"onset": "", "provocation": "", "quality": "", "radiation": "", "severity": "", "time": ""},
 "vitals": [{"time": "", "loc": "", "bp": "", "hr": "", "rr": "", "spo2": "", "gcs": "", "temp": "", "glucose": "", "pain": "", "skin": ""}],
 "conditionObserved": "", "physicalExam": "",
 "interventions": [{"time": "", "intervention": "", "response": ""}], "interventionsPerformed": "",
 "medsAndAllergiesMentioned": [""], "hazards": "", "bystanderStatements": "", "belongings": "", "familyContact": "",
 "transport": {"destination": "", "priority": "", "position": "", "handoffTo": ""},
 "narrative": "2-4 plain sentences of what was said and done, in order",
 "uncertain": [{"field": "", "note": ""}]}`;

// the model sometimes sends "" or [] or {} despite being told not to, strip those so
// an empty field never shows up as a filled one
function prune(value: unknown): unknown {
  if (typeof value === "string") return value.trim() === "" ? undefined : value.trim();
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((v) => v !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([k, v]) => [k, prune(v)] as const)
      .filter(([, v]) => v !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return value ?? undefined;
}

// real condensing, via openai chat completions with json mode. the fake condenser
// (fake-adapters.ts) just echoes the transcript verbatim into one field, this one
// actually extracts into the separate NoteSections fields. non_responder_speech
// flags are still computed deterministically from the diarizer's output, not left to
// the model, that part's reliable enough already and doesn't need an api call
export class OpenAICondenser implements Condenser {
  private apiKey: string;
  private model: string;
  private reasoningEffort?: string;
  private baseUrl: string;

  constructor(config: OpenAICondenserConfig) {
    this.apiKey = config.apiKey;
    // tried on the oct 19 crash drill: 4o-mini wrote "leg entrapment" and made up
    // "capacity: capable". gpt-6-luna with no reasoning got MVC / driver's side / L leg in
    // ~4s for ~0.1 cent. 6.1-sol was a bit more thorough but ~15-20s, too slow for a live
    // form. NIGHTINGALE_CONDENSE_MODEL / _EFFORT override (sol only goes down to "low")
    this.model = config.model ?? "gpt-6-luna";
    this.reasoningEffort = config.reasoningEffort ?? (config.model ? undefined : "none");
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  }

  async condense(transcript: Transcript, ctx: IncidentContext): Promise<DraftNote> {
    const narrationRefs: string[] = [];
    const bystanderRefs: string[] = [];
    const flags: NoteFlag[] = [];
    const lines: string[] = [];

    transcript.segments.forEach((segment, i) => {
      const ref = `segment[${i}]`;
      if (segment.nonResponder) {
        bystanderRefs.push(ref);
        lines.push(`[bystander, ${segment.speaker}] ${segment.text}`);
        flags.push({
          type: "non_responder_speech",
          ref,
          note: `${segment.speaker} speech, review before approval`,
        });
      } else {
        narrationRefs.push(ref);
        lines.push(`[${segment.speaker}] ${segment.text}`);
      }
    });

    // a bad or unparseable response shouldn't take the whole pipeline down mid demo,
    // fall back to an empty note with a flag instead of throwing
    let extracted: ExtractedSections = {};
    try {
      extracted = await this.extract(lines.join("\n"));
    } catch (err) {
      flags.push({
        type: "low_confidence",
        ref: "condenser",
        note: `extraction failed, note left empty: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    const sections: NoteSections = {};
    const sectionsRecord = sections as Record<string, unknown>;
    const spans: NoteSpan[] = [];
    const shape = NoteSections.shape as Record<
      string,
      { safeParse(v: unknown): { success: true; data: unknown } | { success: false } }
    >;

    // every field the schema knows about, validated on its own so one malformed field
    // (say a vitals entry shaped wrong) drops just that field, not the whole note
    for (const [field, schema] of Object.entries(shape)) {
      if (field === "photoNotes") continue;
      const value = prune(extracted[field]);
      if (value === undefined) continue;
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        flags.push({ type: "low_confidence", ref: `sections.${field}`, note: "model returned a malformed value, dropped" });
        continue;
      }
      sectionsRecord[field] = parsed.data;
      spans.push({
        field: `sections.${field}`,
        transcriptSegmentIds: field === "bystanderStatements" ? bystanderRefs : narrationRefs,
      });
    }

    for (const item of extracted.uncertain ?? []) {
      const { field, note } = typeof item === "string" ? { field: undefined, note: item } : item;
      if (!note?.trim()) continue;
      // points at the field when the model named a real one, otherwise the whole note
      const ref = field && field in shape ? `sections.${field}` : "condenser";
      flags.push({ type: "unsupported_claim", ref, note });
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

  private async extract(transcriptText: string): Promise<ExtractedSections> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: "json_object" },
        // openai's newer reasoning models only accept the default temperature, gemini and
        // the gpt-4 ones take 0
        ...(/^(gpt-[5-9]|o\d)/.test(this.model) ? {} : { temperature: 0 }),
        ...(this.reasoningEffort ? { reasoning_effort: this.reasoningEffort } : {}),
        messages: [
          { role: "system", content: CONDENSE_SYSTEM_PROMPT },
          { role: "user", content: transcriptText || "(no speech captured in this clip)" },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`openai condense failed: ${res.status} ${await res.text()}`);
    }

    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    const content = body.choices[0]?.message.content;
    if (!content) throw new Error("openai condense returned no content");

    return JSON.parse(content) as ExtractedSections;
  }
}

export interface OpenAIPhotoCaptionerConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

// one short factual caption per photo, via a vision capable chat model. not the same
// thing as PhotoPass (that's safety processing: blur faces, flag health numbers),
// this is purely "what's in the frame" for the dashboard to show under the thumbnail
export class OpenAIPhotoCaptioner implements PhotoCaptioner {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: OpenAIPhotoCaptionerConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? "gpt-4o-mini";
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  }

  async caption(image: Uint8Array): Promise<string> {
    const base64 = Buffer.from(image).toString("base64");

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "one short factual sentence describing this emergency scene photo for a handoff note. describe only what's visible, no speculation, no diagnosis.",
              },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`openai caption failed: ${res.status} ${await res.text()}`);
    }

    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    return body.choices[0]?.message.content?.trim() || "(no caption)";
  }
}
