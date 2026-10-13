# cross compile scripts

empty for now. once there's an actual daemon to ship (milestone 7), this is where the
`cross build --target aarch64-unknown-linux-gnu` scripts go, build on the pc, scp the
binary over, never compile on the pi itself (512mb ram, it'll choke). see ARCHITECTURE.md
section 5 and section 12 milestone 7a.
