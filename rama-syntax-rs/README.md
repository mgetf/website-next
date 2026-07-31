# rama-syntax-rs

Rust tooling for **.rama v2** surface syntax:

- **Lexer:** [`logos`](https://docs.rs/logos)
- **Parser:** [`chumsky`](https://docs.rs/chumsky)
- **Emit:** Clojure source strings (transpiler — no bytecode)
- **Check:** Specter path type-checker stub

There is no v1 / legacy dialect. Naming conventions (`*var`, trailing `>` on ops) are emitter concerns, not surface syntax.

## Design

See [`DESIGN.md`](./DESIGN.md). Canonical fixture: [`fixtures/match_v2.rama`](./fixtures/match_v2.rama).

## Commands

```bash
cargo test
cargo run --bin rama-check -- check fixtures/match_v2.rama
cargo run --bin rama-check -- transpile fixtures/match_v2.rama
cargo run --bin rama-check -- watch fixtures -o out
```
