// re-runs the epcr for the split field-test cases on a few models and checks the facts we
// know from the scenes. doesn't touch the saved sessions. usage: node scripts/grade-cases.mjs
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const key = fs.readFileSync(path.join(root, ".env"), "utf8").match(/^GEMINI_API_KEY=["']?([^"'\s]+)/m)[1];
const { OpenAICondenser } = await import("@nightingale/pipeline");
const { transcriptEntries } = await import("../dist/drills.js");
const drills = path.join(root, "drills");
const load = (slug) => JSON.parse(fs.readFileSync(path.join(drills, fs.readdirSync(drills).find((d) => d.includes(slug)), "session.json"), "utf8"));

const has = (re) => (e) => re.test(JSON.stringify(e));
const not = (re) => (e) => !re.test(JSON.stringify(e));
const checks = {
  "cardiac-arrest": {
    "no patient name (none was said)": (e) => !e.sections.patient?.name,
    "age conflict flagged": (e) => /32/.test(JSON.stringify(e.flags)) && /57/.test(JSON.stringify(e.flags)),
    "shock delivered": has(/shock (advised|delivered|administered)|shocked|delivered.*shock/i),
    "no invented side": not(/\b(left|right)\b/i),
  },
  "shellfish-allergy": {
    "patient Dave, 18": (e) => /dave/i.test(e.sections.patient?.name ?? "") && /18/.test(e.sections.patient?.age ?? ""),
    "BP 140/90": has(/140\/90/),
    "no EpiPen": has(/epi ?pen/i),
    "no invented side": not(/\b(left|right)\b/i),
  },
  "dirt-bike-femur": {
    "patient Dave": (e) => /dave/i.test(e.sections.patient?.name ?? ""),
    "drunk / intoxicated noted": has(/drunk|intoxicat|alcohol|ETOH/i),
    "'bones in half'": has(/bones? in half/i),
    "pain 6/10": has(/\b6\b|six/i),
    "no invented side": not(/\b(left|right)\b|\bL leg|\bR leg/i),
  },
};

const models = (process.argv[2] ?? "gemini-2.5-flash:none,gemini-3.8-flash,gemini-4-argon,gemini-3.1-pro-preview").split(",");
for (const spec of models) {
  const [model, effort] = spec.split(":");
  const condenser = new OpenAICondenser({ apiKey: key, baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model, reasoningEffort: effort });
  let pass = 0, total = 0, secs = 0;
  const misses = [];
  for (const run of [1, 2]) {
    for (const [slug, list] of Object.entries(checks)) {
      const session = load(slug);
      const segments = transcriptEntries(session).map((x) => ({ start: 0, end: 0, speaker: x.speaker ?? "unlabelled", text: `(${new Date(x.at).toLocaleTimeString("en-GB")}) ${x.text}`, confidence: 1 }));
      const t = Date.now();
      const note = await condenser.condense({ id: "g", captureId: slug, provider: "g", modelVersion: "g", segments }, { captureId: slug, modelVersion: "g", promptVersion: "g" });
      secs += (Date.now() - t) / 1000;
      if (note.flags.some((f) => f.ref === "condenser" && f.type === "low_confidence")) misses.push(`${slug} run ${run}: FAILED ${note.flags[0].note.slice(0, 120)}`);
      for (const [name, fn] of Object.entries(list)) {
        total++;
        if (fn(note)) pass++;
        else misses.push(`${slug} run ${run}: ${name}`);
      }
    }
  }
  console.log(`\n${spec}: ${pass}/${total} checks, avg ${(secs / 6).toFixed(1)}s per epcr`);
  for (const m of misses) console.log("   miss:", m);
}
