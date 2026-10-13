# device

rust capture daemon for the raspberry pi zero 2 w. separate cargo toolchain from the rest
of the monorepo on purpose, see ARCHITECTURE.md section 4 and 5.

right now this is just an empty crate that compiles (milestone 0). the capture state
machine, local queue, and chunked upload client land in milestone 7, after the ingest api
(milestone 1) exists for it to talk to.

```
cargo build
cargo test
cargo fmt --check
cargo clippy
```
