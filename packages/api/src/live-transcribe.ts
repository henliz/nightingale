// live, word-by-word transcription (oct 17 2026), the granola-style path. the pi streams
// raw mic audio (16 khz mono pcm16) to POST /live/:sessionId/audio while it records,
// this file turns that into partial + final transcript text:
//
//   pcm in -> SpeechGate (only stretches that sound like speech, plus 0.5s before them)
//          -> gemini live (gemini-3.5-transcribe-live, 16 khz as is) or openai realtime
//             (gpt-live-transcribe, resampled to 24 khz)
//          -> words as they're said + a final transcript per utterance
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
  /** openai sends new words only, appended to what came before */
  onDelta(itemId: string, delta: string): void;
  /** gemini sends its whole best guess so far each time, which can still change */
  onText?(itemId: string, textSoFar: string): void;
  onFinal(itemId: string, transcript: string): void;
  onError(message: string): void;
}

export interface LiveAsrConnection {
  /** 16 khz mono pcm16, straight from the pi (each provider converts if it needs to) */
  append(pcm16: Uint8Array): void;
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
      append: (pcm16) => {
        const samples = new Int16Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength / 2);
        const pcm24 = new Uint8Array(resample16to24(samples).buffer);
        send({ type: "input_audio_buffer.append", audio: Buffer.from(pcm24).toString("base64") });
      },
      commit: () => send({ type: "input_audio_buffer.commit" }),
      close: () => ws.close(),
    };
  };
}

export const GEMINI_LIVE_MODEL_DEFAULT = "gemini-3.5-transcribe-live";

/**
 * gemini live transcription (oct 19 2026), about half what openai's live model costs.
 *
 * one gemini session per line: each utterance our speech gate lets through gets its own
 * session (activityStart, audio, activityEnd), and a spare is always opened ahead so
 * there's no wait. words stream in while it's said, the finished line lands ~0.5 s after
 * the gate closes. probed on 19 oct against saved drills, the two obvious setups both
 * failed:
 *   - one long session with activityStart/End per line: gemini ignored the boundaries
 *     and sent one giant line at the very end
 *   - one long session using gemini's own voice detection: it skipped whole stretches of
 *     quiet speech (even at high sensitivity)
 * no speaker labels in live mode, those come from the saved chunks
 * (GeminiDiarizedTranscriber)
 */
export function geminiLiveAsr(apiKey: string, model: string = GEMINI_LIVE_MODEL_DEFAULT): LiveAsrFactory {
  // shared across connections so a line id never repeats
  let counter = 0;
  return (events) => {
    interface Session {
      id: string;
      ws: WebSocket;
      openedAt: number;
      ready: boolean;
      pending: string[];
      interim: string;
      /** the finished text, which can arrive in more than one piece */
      final: string;
      ended: boolean;
      done: boolean;
      timer?: ReturnType<typeof setTimeout>;
    }

    const finish = (s: Session, text: string) => {
      if (s.done) return;
      s.done = true;
      clearTimeout(s.timer);
      if (text.trim()) events.onFinal(s.id, text.trim());
      // a moment for anything trailing, then hang up
      setTimeout(() => s.ws.close(1000), 300);
    };

    const open = (): Session => {
      const ws = new WebSocket(
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`,
      );
      const s: Session = {
        id: `gemini_${++counter}`,
        ws,
        openedAt: Date.now(),
        ready: false,
        pending: [],
        interim: "",
        final: "",
        ended: false,
        done: false,
      };
      ws.onopen = () =>
        ws.send(
          JSON.stringify({
            setup: {
              model: `models/${model}`,
              generationConfig: { responseModalities: ["TEXT"] },
              realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
              // no custom vocabulary on purpose, same lesson as the openai prompt: biasing
              // toward ems words made the batch model invent radio calls out of noise
              inputAudioTranscription: { languageCodes: ["en-US"] },
            },
          }),
        );
      ws.onmessage = async (msg) => {
        let event: {
          setupComplete?: object;
          serverContent?: {
            interimInputTranscription?: { text?: string };
            inputTranscription?: { text?: string };
            generationComplete?: boolean;
          };
          error?: { message?: string };
        };
        try {
          const raw = typeof msg.data === "string" ? msg.data : await new Response(msg.data as Blob).text();
          event = JSON.parse(raw);
        } catch {
          return;
        }
        if (event.setupComplete) {
          s.ready = true;
          for (const text of s.pending.splice(0)) ws.send(text);
          return;
        }
        if (event.error) return events.onError(event.error.message ?? "gemini live error");
        const content = event.serverContent;
        if (content?.interimInputTranscription?.text && !s.done) {
          s.interim = content.interimInputTranscription.text;
          events.onText?.(s.id, s.interim.trim());
        }
        if (content?.inputTranscription?.text && !s.done) {
          s.final += content.inputTranscription.text;
          events.onText?.(s.id, s.final.trim());
        }
        // the line's done once generationComplete shows up after our activityEnd (noise
        // with no words gets just that and nothing else)
        if (content?.generationComplete && s.ended) finish(s, s.final || s.interim);
      };
      ws.onerror = () => {
        if (!s.done) events.onError("gemini live websocket error");
      };
      ws.onclose = (e) => {
        if (!s.done && s.ended) finish(s, s.final || s.interim); // keep what was heard
        if (!s.done && e.code !== 1000 && e.code !== 1005) events.onError(`gemini live closed (${e.code} ${e.reason})`);
      };
      return s;
    };

    const send = (s: Session, msg: object) => {
      const text = JSON.stringify(msg);
      if (s.ready && s.ws.readyState === WebSocket.OPEN) s.ws.send(text);
      else s.pending.push(text);
    };

    let spare: Session | null = open();
    let line: Session | null = null;
    const takeSpare = () => {
      // a session only lives 10 minutes, don't start a line on one that's nearly done
      let s = spare;
      if (!s || Date.now() - s.openedAt > 8 * 60_000) {
        s?.ws.close(1000);
        s = open();
      }
      spare = open();
      return s;
    };

    return {
      append: (pcm16) => {
        if (!line) {
          line = takeSpare();
          send(line, { realtimeInput: { activityStart: {} } });
        }
        send(line, { realtimeInput: { audio: { data: Buffer.from(pcm16).toString("base64"), mimeType: "audio/pcm;rate=16000" } } });
      },
      commit: () => {
        if (!line) return;
        const s = line;
        line = null;
        s.ended = true;
        send(s, { realtimeInput: { activityEnd: {} } });
        // the final normally lands within a second. if it never does, keep the interim
        s.timer = setTimeout(() => finish(s, s.final || s.interim), 6000);
      },
      close: () => {
        spare?.ws.close(1000);
        spare = null;
        if (line) {
          const s = line;
          line = null;
          s.ended = true;
          send(s, { realtimeInput: { activityEnd: {} } });
          s.timer = setTimeout(() => finish(s, s.final || s.interim), 6000);
        }
      },
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
  private connOpenedAt = 0;
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
    if (conn) setTimeout(() => conn.close(), 8000);
    this.conn = null;
  }

  private apply(actions: GateAction[]) {
    for (const action of actions) {
      if (action.type === "send") {
        const boosted = this.gain.process(action.frame);
        this.connection().append(new Uint8Array(boosted.buffer));
      } else {
        this.conn?.commit();
        // a long-lived connection gets swapped for a fresh one between utterances after
        // ~8 minutes (the old one gets a few seconds to send its last words)
        if (this.conn && Date.now() - this.connOpenedAt > 8 * 60_000) {
          const old = this.conn;
          setTimeout(() => old.close(), 8000);
          this.conn = null;
        }
      }
    }
  }

  // opened lazily on the first speech, so a silent recording never even connects
  private connection(): LiveAsrConnection {
    if (!this.conn) {
      this.connOpenedAt = Date.now();
      let mine: LiveAsrConnection | null = null;
      mine = this.conn = this.factory({
        onDelta: (id, delta) => {
          const text = (this.partials.get(id) ?? "") + delta;
          this.partials.set(id, text);
          this.callbacks.onPartial(id, text);
        },
        onText: (id, text) => {
          this.partials.set(id, text);
          this.callbacks.onPartial(id, text);
        },
        onFinal: (id, transcript) => {
          this.partials.delete(id);
          this.callbacks.onFinal(id, transcript.trim());
        },
        onError: (message) => {
          // drop the dead connection, the next speech opens a fresh one. only if it's
          // still the current one, an old retired session closing isn't a problem
          mine?.close();
          if (this.conn === mine) this.conn = null;
          this.callbacks.onError(message);
        },
      });
    }
    return this.conn;
  }
}
