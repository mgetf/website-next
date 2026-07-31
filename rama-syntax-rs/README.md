# rama-syntax-rs

Rust tooling for **.rama v2** surface syntax:

- **Lexer:** [`logos`](https://docs.rs/logos)
- **Parser:** [`chumsky`](https://docs.rs/chumsky)
- **IRs:** semantic Rama IR → Clojure Form IR → source
- **Types:** typed ordinary `fn`, quantified/overloaded Clojure externs,
  JVM nominal generics, unions, `Unknown`/`Dynamic`
- **Contracts:** generated checks at typed/untyped Clojure boundaries
- **Check:** Rama rules plus JVM value typing (path/schema typing next)

There is no v1 / legacy dialect. Naming conventions (`*var`, trailing `>` on ops) are emitter concerns, not surface syntax.

## Design

See [`DESIGN.md`](./DESIGN.md), [`TYPE_SYSTEM.md`](./TYPE_SYSTEM.md), and
[`CLOJURE_BOUNDARY.md`](./CLOJURE_BOUNDARY.md). Canonical fixtures:
[`fixtures/match_v2.rama`](./fixtures/match_v2.rama) and
[`fixtures/typed_fn.rama`](./fixtures/typed_fn.rama).

## Commands

```bash
cargo test
cargo test --test typed_contract_smoke -- --ignored
cargo run --bin rama-check -- check fixtures/match_v2.rama
cargo run --bin rama-check -- transpile fixtures/match_v2.rama
cargo run --bin rama-check -- watch fixtures -o out
```
