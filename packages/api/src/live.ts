// in-memory live feed for the dev dashboard: device logs, server logs, and "this asset
// changed" pings, pushed to the browser over server-sent events. dev only, nothing
// persists, nothing is access controlled (ARCHITECTURE.md section 9, item 5).
// same rule as the device side: log lines never carry transcript text or media

export type LogLevel = "info" | "warn" | "error";

export interface LiveLogLine {
  id: number;
  ts: number; // unix millis
  source: string; // "server" or a device id
  level: LogLevel;
  msg: string;
  /** which drill session this line belongs to, when known */
  sessionId?: string;
}

/** live transcript text for one utterance, sent on every new word and once more when final */
export interface LiveTranscriptEvent {
  sessionId: string;
  id: string;
  text: string;
  final: boolean;
  startedAt: number;
}

export type LiveEvent =
  | { type: "log"; line: LiveLogLine }
  | { type: "update"; assetId: string }
  | { type: "transcript"; transcript: LiveTranscriptEvent };

type Listener = (event: LiveEvent) => void;

export interface LiveHub {
  log(source: string, level: LogLevel, msg: string, opts?: { ts?: number; sessionId?: string }): void;
  update(assetId: string): void;
  transcript(event: LiveTranscriptEvent): void;
  recentLogs(): LiveLogLine[];
  subscribe(listener: Listener): () => void;
}

export function createLiveHub({ maxLines = 2000, echo = false } = {}): LiveHub {
  const lines: LiveLogLine[] = [];
  const listeners = new Set<Listener>();
  let nextId = 1;

  const broadcast = (event: LiveEvent) => {
    for (const listener of listeners) listener(event);
  };

  return {
    log(source, level, msg, { ts = Date.now(), sessionId }: { ts?: number; sessionId?: string } = {}) {
      const line: LiveLogLine = { id: nextId++, ts, source, level, msg, sessionId };
      lines.push(line);
      if (lines.length > maxLines) lines.shift();
      if (echo) {
        const out = `[${new Date(ts).toLocaleTimeString()}] ${source} ${level}: ${msg}`;
        if (level === "info") console.log(out);
        else console.error(out);
      }
      broadcast({ type: "log", line });
    },
    update(assetId) {
      broadcast({ type: "update", assetId });
    },
    transcript(event) {
      broadcast({ type: "transcript", transcript: event });
    },
    recentLogs() {
      return [...lines];
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
