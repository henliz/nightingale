# device

rust capture daemon for the raspberry pi zero 2 w. separate cargo toolchain from the rest
of the monorepo on purpose, see ARCHITECTURE.md section 4 and 5.

`src/upload.rs` is the milestone 1 piece: a client that reads a file, chunks it, and pushes
it through the ingest api in `packages/api` (init -> upload each part -> complete, sha256
checked on both ends). tested against a mocked http server (`httpmock`), not a live node
process, since the only real contract between the two is http (ARCHITECTURE.md section 4).

the capture state machine, local queue, button/led/camera wiring, and actually calling
`upload.rs` from `main.rs` land in milestone 7, once there's a real daemon to drive it.

```
cargo build
cargo test
cargo fmt --check
cargo clippy
```
