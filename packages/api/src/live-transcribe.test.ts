import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoGain, frameDbfs, geminiLiveAsr, resample16to24, SpeechGate, type GateAction } from "./live-transcribe.js";

const frame = (amplitude: number) =>
  Int16Array.from({ length: 1600 }, (_, i) => Math.round(amplitude * Math.sin(i / 3)));
const quiet = () => frame(20); // about -64 dBFS, room tone on the pi's quiet mic
const speech = () => frame(3000); // about -24 dBFS

function run(gate: SpeechGate, frames: Int16Array[]): GateAction[] {
  return frames.flatMap((f) => gate.push(f));
}

describe("SpeechGate", () => {
  it("never sends anything for silence", () => {
    const gate = new SpeechGate();
    expect(run(gate, Array.from({ length: 100 }, quiet))).toEqual([]);
    expect(gate.flush()).toEqual([]);
  });

  it("sends speech with 0.5s of lead-in, then commits after 1s of quiet", () => {
    const gate = new SpeechGate();
    run(gate, Array.from({ length: 20 }, quiet));
    const actions = run(gate, [
      ...Array.from({ length: 10 }, speech),
      ...Array.from({ length: 15 }, quiet),
    ]);
    const sends = actions.filter((a) => a.type === "send").length;
    const commits = actions.filter((a) => a.type === "commit").length;
    expect(commits).toBe(1);
    // 5 lead-in + 10 speech + 10 hangover
    expect(sends).toBe(25);
    expect(actions.at(-1)).toEqual({ type: "commit" });
  });

  it("still hears speech on a quiet mic, relative to the room's floor", () => {
    const gate = new SpeechGate();
    run(gate, Array.from({ length: 20 }, () => frame(5))); // -76 dBFS floor
    const actions = run(gate, Array.from({ length: 3 }, () => frame(60))); // only ~-55 dBFS
    expect(actions.some((a) => a.type === "send")).toBe(true);
  });

  it("commits a long monologue every 20s instead of waiting for a pause", () => {
    const gate = new SpeechGate();
    const actions = run(gate, Array.from({ length: 450 }, speech));
    expect(actions.filter((a) => a.type === "commit").length).toBe(2);
  });
});

describe("resample16to24", () => {
  it("makes 1.5x the samples and keeps the level", () => {
    const out = resample16to24(Int16Array.from({ length: 1600 }, () => 1000));
    expect(out.length).toBe(2400);
    expect(out.every((s) => s === 1000)).toBe(true);
  });
});

describe("AutoGain", () => {
  it("brings the pi's very quiet speech up to a normal level", () => {
    const gain = new AutoGain();
    let out: Int16Array = frame(300); // about -44 dBFS, what a loud tv measured on the pi's mic
    for (let i = 0; i < 30; i++) out = gain.process(frame(300));
    expect(frameDbfs(out)).toBeGreaterThan(-23);
    expect(frameDbfs(out)).toBeLessThan(-17);
  });

  it("reaches full boost within a few frames, so a quick phrase isn't missed", () => {
    const gain = new AutoGain();
    gain.process(frame(300));
    gain.process(frame(300));
    const third = gain.process(frame(300));
    expect(frameDbfs(third)).toBeGreaterThan(-23);
  });

  it("keeps its boost between utterances", () => {
    const gain = new AutoGain();
    for (let i = 0; i < 10; i++) gain.process(frame(300));
    const before = gain.currentGainDb;
    // (silence isn't sent to it at all, the gate holds it back) next utterance starts boosted
    gain.process(frame(300));
    expect(gain.currentGainDb).toBeGreaterThanOrEqual(before - 1);
  });

  it("never boosts more than +36 dB and never clips", () => {
    const gain = new AutoGain();
    let out: Int16Array = frame(1);
    for (let i = 0; i < 60; i++) out = gain.process(frame(1));
    expect(gain.currentGainDb).toBeLessThanOrEqual(36);
    const loud = gain.process(frame(30000)); // sudden shout after the boost
    expect(Math.max(...loud.map(Math.abs))).toBeLessThanOrEqual(32767);
  });

  it("leaves already-loud audio alone", () => {
    const gain = new AutoGain();
    const out = gain.process(frame(8000)); // about -12 dBFS
    expect(gain.currentGainDb).toBe(0);
    expect(out[5]).toBe(frame(8000)[5]);
  });
});

describe("geminiLiveAsr", () => {
  afterEach(() => vi.unstubAllGlobals());

  // stands in for gemini's websocket: records what we send, lets the test play the server
  class FakeSocket {
    static last: FakeSocket;
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 1;
    sent: Record<string, any>[] = [];
    onopen?: () => void;
    onmessage?: (m: { data: string }) => void | Promise<void>;
    onerror?: () => void;
    onclose?: (e: { code: number; reason: string }) => void;
    constructor(public url: string) {
      FakeSocket.last = this;
    }
    send(text: string) {
      this.sent.push(JSON.parse(text));
    }
    close() {}
    server(msg: object) {
      return this.onmessage?.({ data: JSON.stringify(msg) });
    }
  }

  it("gives each line its own session (with a spare ready), streams words, then the final", async () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    const texts: string[] = [];
    const finals: [string, string][] = [];
    const conn = geminiLiveAsr("key")({
      onDelta: () => {},
      onText: (_id, t) => texts.push(t),
      onFinal: (id, t) => finals.push([id, t]),
      onError: (m) => { throw new Error(m); },
    });
    const first = FakeSocket.last; // the spare, opened straight away
    expect(first.url).toContain("key=key");
    first.onopen!();
    expect(first.sent[0]!.setup.realtimeInputConfig.automaticActivityDetection.disabled).toBe(true);

    conn.append(new Uint8Array(3200)); // takes the spare, opens the next one
    const second = FakeSocket.last;
    expect(second).not.toBe(first);
    expect(first.sent).toHaveLength(1); // held until setup's done
    await first.server({ setupComplete: {} });
    conn.append(new Uint8Array(3200));
    conn.commit();
    expect(first.sent.slice(1).map((m) => Object.keys(m.realtimeInput)[0])).toEqual(["activityStart", "audio", "audio", "activityEnd"]);
    expect(first.sent[2]!.realtimeInput.audio.mimeType).toBe("audio/pcm;rate=16000");

    // the next line goes to the second session
    second.onopen!();
    await second.server({ setupComplete: {} });
    conn.append(new Uint8Array(3200));
    expect(Object.keys(second.sent[1]!.realtimeInput)[0]).toBe("activityStart");

    await first.server({ serverContent: { interimInputTranscription: { text: "where does it" } } });
    await first.server({ serverContent: { inputTranscription: { text: "Where does" } } }); // in pieces
    await first.server({ serverContent: { inputTranscription: { text: " it hurt?" } } });
    await first.server({ serverContent: { generationComplete: true } });
    await second.server({ serverContent: { interimInputTranscription: { text: "my left" } } });
    conn.commit();
    await second.server({ serverContent: { generationComplete: true } }); // no final: keeps the interim
    expect(texts).toEqual(["where does it", "Where does", "Where does it hurt?", "my left"]);
    expect(finals.map((f) => f[1])).toEqual(["Where does it hurt?", "my left"]);
    expect(finals[0]![0]).not.toBe(finals[1]![0]);
  });
});
