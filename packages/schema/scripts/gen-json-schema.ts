import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import * as schemas from "../src/index.js";

// grabs every zod schema from src/index.ts by export name
// this is the single source of truth the rust device + any external caller validates against, see ARCHITECTURE.md section 4
const EXPORTS = schemas as Record<string, { _def?: unknown }>;

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "generated");
mkdirSync(outDir, { recursive: true });

const combined: Record<string, unknown> = {};

for (const [name, value] of Object.entries(EXPORTS)) {
  if (!value || typeof value !== "object" || !("_def" in value)) continue;
  const jsonSchema = zodToJsonSchema(value as never, { name });
  writeFileSync(join(outDir, `${name}.schema.json`), JSON.stringify(jsonSchema, null, 2) + "\n");
  combined[name] = jsonSchema;
}

writeFileSync(join(outDir, "all.schema.json"), JSON.stringify(combined, null, 2) + "\n");

console.log(`Wrote ${Object.keys(combined).length} JSON Schema files to ${outDir}`);
