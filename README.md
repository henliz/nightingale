# nightingale

a shared record that crosses custody, fire then paramedics then hospital ed. full writeup
of what this actually is and why in [ARCHITECTURE.md](./ARCHITECTURE.md), read that first.

capstone prototype only right now. scripted drills, fictional patients, no real patient
info goes through this thing.

## status

milestone 0 (scaffold). pnpm workspace + schema package + fixtures + CI + an empty rust
device crate that compiles. nothing past that is built yet, see ARCHITECTURE.md section 12
for the build order.

## getting started

```
pnpm install
pnpm run dev:services   # postgres + minio via docker compose
pnpm run typecheck
pnpm run test
```

device stuff lives in `device/`, separate cargo toolchain:

```
cd device
cargo build
cargo test
```

## layout

- `packages/schema`: zod schemas + json schema export, single source of truth for the data model
- `packages/fixtures`: two fictional drill scenarios, everything else tests against these
- `packages/api`, `packages/pipeline`, `packages/retention`, `packages/audit`, `packages/web`: placeholders, each has a README saying which milestone builds it
- `device/`: rust capture daemon for the pi, empty crate for now
