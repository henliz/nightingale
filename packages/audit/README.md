# @nightingale/audit

milestone 2 done: a hash chained audit log.

- `createAuditLog(store)`: `record(input)` appends an event, hashing it to the previous event's hash (`prevHash`). `verify()` walks the whole chain and tells you if anything broke
- `verifyChain(events)`: same check, but pure, takes a plain array. lets tests tamper with events directly without spinning up a store
- `MemoryAuditStore`: fake, in memory, what the tests use. durable storage (postgres) is a later milestone

wired into `@nightingale/api`: every ingest route (init, upload a part, check status, complete) records an event. actor identity right now comes off plain request headers (`x-actor-id`, `x-actor-role`) since real auth doesn't exist yet, that's **milestone 4** (ARCHITECTURE.md section 7).
