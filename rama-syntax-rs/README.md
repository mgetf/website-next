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
[`CLOJURE_BOUNDARY.md`](./CLOJURE_BOUNDARY.md). Live runtime discovery and
source pinning are documented in [`LIVE_ORACLE.md`](./LIVE_ORACLE.md).

Canonical module sources live in [`../rama/src/mge/tf/rama/`](../rama/src/mge/tf/rama/).
Language fixtures: [`fixtures/typed_fn.rama`](./fixtures/typed_fn.rama),
[`fixtures/higher_order.rama`](./fixtures/higher_order.rama).

`.rama` files are either:

1. **Surface modules** (`module …`) — typed pipeline → Clojure module
2. **Sexp mode** (starts with `(` / `#!clj`) — Form IR → arbitrary Clojure (tests)

## Commands

```bash
cargo test
cargo test --test typed_contract_smoke -- --ignored
cargo run --bin rama-check -- check ../rama/src/mge/tf/rama/match_module.rama
cargo run --bin rama-check -- check fixtures/typed_fn.rama --nrepl 127.0.0.1:7888
cargo run --bin rama-check -- observe-call fixtures/typed_fn.rama clojure.core/vec --args '[[1 2]]' --nrepl 127.0.0.1:7888
cargo run --bin rama-check -- transpile ../rama/src/mge/tf/rama/match_module.rama
bash ../rama/scripts/transpile-rama.sh
bash ../rama/scripts/test-rama.sh
```
