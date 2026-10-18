// live, word-by-word transcription (oct 17 2026), the granola-style path. the pi streams
// raw mic audio (16 khz mono pcm16) to POST /live/:sessionId/audio while it records,
// this file turns that into partial + final transcript text:
//
//   pcm in -> SpeechGate (only stretches that sound like speech, plus 0.5s before them)
//          -> resample to 24 khz -> openai realtime, gpt-live-transcribe
//          -> deltas (words as they're said) + a final transcript per utterance
//
// silence never gets sent, so it can't turn into text or clutter the transcript. the
// 30s wav chunks still upload separately as the record of what was captured, and only
// get batch-transcribed if this live path was down while they were recorded.
//
// probed against the real api on 17 oct 2026: gpt-live-transcribe streamed words
// ~0.3 s after they were spoken and returned an empty transcript for 12 s of room
// noise + keyboard clicks. it has no server-side turn detection, so the gate commits
// each utterance itself

export interface LiveAsrEvents {
  onDelta(itemId: string, delta: string): void;
  onFinal(itemId: string, transcript: string): void;
  onError(message: string): void;
}

export interface LiveAsrConnection {
  /** 24 khz mono pcm16 */
  append(pcm24: Uint8Array): void;
  /** end of an utterance, finalizes it */
  commit(): void;
  close(): void;
}

export type LiveAsrFactory = (events: LiveAsrEvents) => LiveAsrConnection;

export const LIVE_MODEL_DEFAULT = "gpt-live-transcribe";

export type NoiseReduction = "near_field" | "far_field" | null;

export function openAiLiveAsr(
  apiKey: string,
  model: string = LIVE_MODEL_DEFAULT,
  noiseReduction: NoiseReduction = null,
): LiveAsrFactory {
  return (events) => {
    // node 22's built-in websocket can't set headers, the realtime api takes the key as
    // a subprotocol instead. server side only, the key never reaches a browser
    const ws = new WebSocket("wss://api.openai.com/v1/realtime?intent=transcription", [
      "realtime",
      `openai-insecure-api-key.${apiKey}`,
    ]);
    const pending: string[] = [];
    const send = (msg: object) => {
      const text = JSON.stringify(msg);
      if (ws.readyState === WebSocket.OPEN) ws.send(text);
      else if (ws.readyState === WebSocket.CONNECTING) pending.push(text);
    };

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "transcription",
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                // no prompt / keywords on purpose: a vocab prompt made the batch model
                // invent whole radio calls out of near-silence
                transcription: { model, language: "en" },
                turn_detection: null,
                // off by default: "near_field" suppresses anything not right at the mic,
                // which threw away a tv a few feet away and would do the same to a
                // patient or bystander a metre from a body-worn mic (17 oct 2026)
                noise_reduction: noiseReduction ? { type: noiseReduction } : null,
              },
            },
          },
        }),
      );
      for (const text of pending.splice(0)) ws.send(text);
    };
    ws.onmessage = (msg) => {
      let event: { type?: string; item_id?: string; delta?: string; transcript?: string; error?: { message?: string } };
      try {
        event = JSON.parse(String(msg.data));
      } catch {
        return;
      }
      if (event.type === "conversation.item.input_audio_transcription.delta" && event.item_id) {
        events.onDelta(event.item_id, event.delta ?? "");
      } else if (event.type === "conversation.item.input_audio_transcription.completed" && event.item_id) {
        events.onFinal(event.item_id, event.transcript ?? "");
      } else if (event.type === "error") {
        events.onError(event.error?.message ?? "unknown realtime error");
      }
    };
    ws.onerror = () => events.onError("realtime websocket error");

    return {
      append: (pcm24) => send({ type: "input_audio_buffer.append", audio: Buffer.from(pcm24).toString("base64") }),
      commit: () => send({ type: "input_audio_buffer.commit" }),
      close: () => ws.close(),
    };
  };
}

// ---- speech gate ----

const FRAME_SAMPLES = 1600; // 100 ms at 16 khz
const FRAME_BYTES = FRAME_SAMPLES * 2;

export function frameDbfs(frame: Int16Array): number {
  let sumSq = 0;
  for (const s of frame) sumSq += s * s;
  return 20 * Math.log10(Math.max(Math.sqrt(sumSq / Math.max(frame.length, 1)), 1) / 32768);
}

export type GateAction = { type: "send"; frame: Int16Array } | { type: "commit" };

/**
 * decides which 100 ms frames are worth transcribing. adaptive: tracks the room's noise
 * floor and calls a frame speech when it's clearly above it, so a quiet mic still works.
 * sends 0.5 s of audio from before speech started (so the first word isn't clipped),
 * keeps sending until 1 s after it stops, then commits. a very long utterance gets
 * committed every 20 s so the transcript and epcr don't wait forever.
 */
export class SpeechGate {
  private floor = -60;
  private preroll: Int16Array[] = [];
  private speaking = false;
  private quietFrames = 0;
  private sentFrames = 0;

  constructor(
    private readonly marginDb = 9,
    private readonly prerollFrames = 5,
    private readonly hangoverFrames = 10,
    private readonly maxFrames = 200,
  ) {}

  push(frame: Int16Array): GateAction[] {
    const db = frameDbfs(frame);
    // floor follows quiet frames down fast, creeps up slowly so speech can't drag it up
    this.floor = db < this.floor ? db : Math.min(this.floor + 0.05, db);
    const loud = db > this.floor + this.marginDb && db > -75;
    const actions: GateAction[] = [];

    if (!this.speaking) {
      if (loud) {
        this.speaking = true;
        this.quietFrames = 0;
        this.sentFrames = 0;
        for (const f of this.preroll) actions.push({ type: "send", frame: f });
        this.preroll = [];
        actions.push({ type: "send", frame });
        this.sentFrames += actions.length;
      } else {
        this.preroll.push(frame);
        if (this.preroll.length > this.prerollFrames) this.preroll.shift();
      }
      return actions;
    }

    actions.push({ type: "send", frame });
    this.sentFrames++;
    this.quietFrames = loud ? 0 : this.quietFrames + 1;
    if (this.quietFrames >= this.hangoverFrames || this.sentFrames >= this.maxFrames) {
      actions.push({ type: "commit" });
      this.speaking = false;
      this.preroll = [];
    }
    return actions;
  }

  /** stream ended: finalize whatever was in flight */
  flush(): GateAction[] {
    if (!this.speaking) return [];
    this.speaking = false;
    return [{ type: "commit" }];
  }
}

// 16 khz -> 24 khz (x1.5), linear interpolation, good enough for speech
export function resample16to24(input: Int16Array): Int16Array {
  const out = new Int16Array(Math.floor((input.length * 3) / 2));
  for (let j = 0; j < out.length; j++) {
    const pos = (j * 2) / 3;
    const i = Math.floor(pos);
    const a = input[i] ?? 0;
    const b = input[Math.min(i + 1, input.length - 1)] ?? a;
    out[j] = Math.round(a + (b - a) * (pos - i));
  }
  return out;
}

// ---- automatic gain ----

/**
 * the pi's mic records very quietly (a tv blasting right beside it peaked around
 * -40 dBFS, 17 oct 2026), too quiet for the model to make out words. this brings speech
 * up to a normal level before it's sent: aims speech at -20 dBFS, up to +36 dB,
 * hard-limited so it never clips.
 *
 * the gain follows the level of recent speech, not each frame, and it REMEMBERS it
 * between utterances. the first version started every session at 0 dB and crept up
 * 1.5 dB per 100 ms, so a quick phrase was over before the boost arrived ("fast speech
 * gets missed"). now it reaches full boost within ~3 frames and keeps it.
 * only touches what goes to live transcription, the saved wav stays exactly as recorded
 */
export class AutoGain {
  private gainDb = 0;
  private speechDb: number | null = null;

  constructor(
    private readonly targetDbfs = -20,
    private readonly maxGainDb = 36,
  ) {}

  get currentGainDb() {
    return this.gainDb;
  }

  process(frame: Int16Array): Int16Array {
    const level = frameDbfs(frame);
    // track speech loudness: rises to a louder frame at once, settles down slowly, so
    // the quiet gaps between words don't drag the boost up and pump the noise
    this.speechDb = this.speechDb === null || level > this.speechDb ? level : this.speechDb - 0.3;
    const wanted = Math.max(0, Math.min(this.maxGainDb, this.targetDbfs - this.speechDb));
    // down at once (no blasting the model), up fast (12 dB per 100 ms frame)
    this.gainDb = wanted < this.gainDb ? wanted : this.gainDb + Math.min(12, wanted - this.gainDb);
    const k = 10 ** (this.gainDb / 20);
    const out = new Int16Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      out[i] = Math.max(-32767, Math.min(32767, Math.round(frame[i]! * k)));
    }
    return out;
  }
}

// ---- one live stream ----

export interface LiveSessionCallbacks {
  onPartial(itemId: string, text: string): void;
  onFinal(itemId: string, text: string): void;
  onError(message: string): void;
}

/** feeds raw pcm bytes from one device stream through the gate into the asr */
export class LiveStream {
  private gate = new SpeechGate();
  private gain = new AutoGain();
  private carry = new Uint8Array(0);
  private conn: LiveAsrConnection | null = null;
  private partials = new Map<string, string>();

  constructor(
    private readonly factory: LiveAsrFactory,
    private readonly callbacks: LiveSessionCallbacks,
  ) {}

  feed(bytes: Uint8Array) {
    const buf = new Uint8Array(this.carry.length + bytes.length);
    buf.set(this.carry);
    buf.set(bytes, this.carry.length);
    let offset = 0;
    while (offset + FRAME_BYTES <= buf.length) {
      const frame = new Int16Array(buf.slice(offset, offset + FRAME_BYTES).buffer);
      this.apply(this.gate.push(frame));
      offset += FRAME_BYTES;
    }
    this.carry = buf.slice(offset);
  }

  end() {
    this.apply(this.gate.flush());
    // give the last utterance a moment to come back before hanging up
    const conn = this.conn;
    if (conn) setTimeout(() => conn.close(), 5000);
    this.conn = null;
  }

  private apply(actions: GateAction[]) {
    for (const action of actions) {
      if (action.type === "send") {
        const boosted = this.gain.process(action.frame);
        this.connection().append(new Uint8Array(resample16to24(boosted).buffer));
      } else {
        this.conn?.commit();
      }
    }
  }

  // opened lazily on the first speech, so a silent recording never even connects
  private connection(): LiveAsrConnection {
    if (!this.conn) {
      this.conn = this.factory({
        onDelta: (id, delta) => {
          const text = (this.partials.get(id) ?? "") + delta;
          this.partials.set(id, text);
          this.callbacks.onPartial(id, text);
        },
        onFinal: (id, transcript) => {
          this.partials.delete(id);
          this.callbacks.onFinal(id, transcript.trim());
        },
        onError: (message) => {
          // drop the dead connection, the next speech opens a fresh one
          this.conn?.close();
          this.conn = null;
          this.callbacks.onError(message);
        },
      });
    }
    return this.conn;
  }
}
