# cross compile

see `../deploy.sh`, it does the `cross build --release --target aarch64-unknown-linux-gnu`
+ copy + restart. build on the pc, never on the pi itself (512mb ram, it'll choke). on an
apple silicon mac cross's images run under amd64 emulation, deploy.sh sets that up, see
`../README.md` for the one-time rustup step.
