import { readFileSync } from "node:fs";
import { LiveStream, openAiLiveAsr } from "./src/live-transcribe.ts";
const key = readFileSync("../../.env", "utf8").match(/OPENAI_API_KEY=(.+)/)![1]!.trim();
const nr = "none" === "none" ? null : ("none" as "near_field" | "far_field");
const out: string[] = [];
for (const f of ["193541_4a0e236b.wav", "193612_977ff402.wav"]) {
  const pcm = readFileSync("/Users/henriettavanniekerk/Documents/GitHub/nightingale/drills/2026-10-17_19-34-40_session_1792280080/audio/" + f).subarray(44);
  const ls = new LiveStream(openAiLiveAsr(key, undefined, nr), { onPartial: () => {}, onFinal: (_i, t) => t && out.push(t), onError: (m) => console.log("ERR", m) });
  // feed faster than real time (4x) to keep the test short
  for (let i = 0; i < pcm.length; i += 3200) { ls.feed(pcm.subarray(i, i + 3200)); await new Promise((r) => setTimeout(r, 25)); }
  ls.feed(new Uint8Array(64000));
  await new Promise((r) => setTimeout(r, 5000));
  ls.end();
}
console.log("noise reduction none:", JSON.stringify(out.join(" | ")));
process.exit(0);
