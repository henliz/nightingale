# @nightingale/schema

single source of truth for nightingale's data model (ARCHITECTURE.md section 6).

- `src/*.ts`: zod schemas + inferred TS types
- `pnpm --filter @nightingale/schema run gen:json-schema`: exports JSON Schema to `generated/`, one file per type plus `all.schema.json`. this is the contract the rust device and any external caller validates uploads against (ARCHITECTURE.md section 4, "the only contract between them is HTTP")

`generated/` is build output and isn't committed, regenerate it after changing a schema
