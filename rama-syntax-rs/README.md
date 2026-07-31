# rama-syntax-rs

Rust **parser** and **type-checker stub** for Rama surface syntax (`.rama`).

Design follows [tommy-mor/rama-syntax](https://github.com/tommy-mor/rama-syntax):

- C-style dataflow (`ramaop` / `ramafn`, `if`, `atomic`, anchors/hooks)
- PState **select** `$$p --> path > *binding;`
- PState **transform** `$$p !<-- path, termval(...);`
- Binding pipe `>` and Clojure-ish maps/lists

Plus the idea from that repo’s `init.tdsl`: a **path static typechecker on PStates** — wired here as a stub that checks `keypath` / field / navigator / `termval` shapes against declared schemas.

Fixtures sketch this repo’s Clojure `MatchModule` (`rama/src/mge/tf/rama/match_module.clj`) in surface syntax.

## Layout

```
src/
  lex.rs      tokenizer
  parse.rs    recursive-descent parser → AST
  ast.rs      AST types
  check.rs    PState path type-checker stub
  bin/rama-check.rs
fixtures/
  match_create.rama   MatchModule create/ban sketch + schemas
  first.rama          subset of rama-syntax examples/first.rama
  bad_paths.rama      intentional type errors
```

## Schema extension

Not in the upstream tree-sitter grammar; added so the checker has something to check:

```rama
pstate $$matches {
  String -> fixed {
    "status": String
    "homeScore": Long
  }
}
```

## Checks implemented (stub)

| Check | Example |
| --- | --- |
| Unknown `$$pstate` | use without `pstate` decl |
| Unknown fixed field | `keypath(*id, "nope")` |
| Navigator inside `keypath` | `keypath(*id, "actions", "AFTER-ELEM")` — the MatchModule scar |
| Transform terminator | path must end in `term` / `termval` / `NONE>` |
| `nil->val` alone | not a write |
| `termval` literal vs field type | `termval("x")` into `Long` |
| `term`/`termval` on select | write ops on `-->` |

Not yet: full dataflow types, `|hash` partition awareness, helper `defn` return types, `and>`/`or>` linting.

## Usage

```bash
cd rama-syntax-rs
cargo test
cargo run --bin rama-check -- fixtures/match_create.rama
cargo run --bin rama-check -- fixtures/bad_paths.rama
```

## Relation to Clojure modules

TypeScript still talks to Rama only via REST JSON. This crate is tooling for a future `.rama` surface (or for checking path shapes) — it does not replace `rama/` Leiningen modules.
