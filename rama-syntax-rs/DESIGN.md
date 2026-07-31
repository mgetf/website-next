# .rama v2 — design notes

v1 (current parser) transliterates Clojure-Rama's implementation vocabulary into
C-style clothes. Every wart below is compiler-internal vocabulary leaking into
surface syntax. v2's rule: **if the compiler can know it, the human doesn't type it.**
All lowering nits are the Rust program's job.

## Critique of v1

| # | Wart | Root cause | v2 fix |
|---|------|-----------|--------|
| 1 | Sigil soup: `*var` `%fn` `$$pstate` `\|hash` `<anchor>` `:kw` `-->` `!<--` `>` | Clojure macroexpander needs sigils; we have a symbol table | No sigils. Declared names are just names. Keywords removed (string keys only). |
| 2 | Stacked `get(*event, "field") > *field;` | No destructuring in dataflow | JS-style destructuring, incl. in `on` handler heads |
| 3 | Trailing `>` (`ramaop foo>`, `ack-return>`, `unify>`) | Clojure-Rama emit-stream naming convention | Plain keywords: `on`, `ack`, `flow`. Emit-shape inferred. |
| 4 | N parallel `!<--` transforms to one entity | No record assignment | `matches[id] = { ... }` lowers to one `multi-path` transform; `<-` merges |
| 5 | Read/write arrow asymmetry (`-->` vs `!<--`) + comma path DSL | Specter paths as user-facing API | Subscript/dot lvalues: `x = matches[id].status`, `matches[id].status = x` |
| 6 | `termval` / `term` / `nil->val` / `AFTER-ELEM` in user code | Navigator vocabulary is the API | `+=` (schema-derived zero default), `?? 0`, `list push item` |
| 7 | `\|hash(*id);` bare statement | Partition hop modeled as an op | `at partition(id) { ... }` block — makes "reads must hop too" structural |
| 8 | Validation pyramids / error-string defns | Deep `<<if` stack-overflows the Clojure compiler | `fail "msg" if cond` guard clauses; compiler emits flat error/ack shape |
| 9 | `{"ok" true}` juxtaposed pairs | Clojure map literal | JS object literals: `{ ok: true, matchId }` with punning |
| 10 | `ramaop` vs `ramafn` | CPS emit semantics in declaration keywords | One construct; compiler analyzes emit shape |

## v2 sketch

See `fixtures/match_v2.rama` (aspirational — parser does not accept it yet).

```rama
on matchEvents "create-match" { matchId, homeTeamId, awayTeamId, seasonId, boGames, pool } {
  fail "match-exists" if matches[matchId] exists

  matches[matchId] = {
    homeTeamId, awayTeamId, seasonId,
    status: "UNPLAYED", homeScore: 0, awayScore: 0,
    boGames: long(boGames ?? 0),
  }

  at partition(homeTeamId) { matchesByTeam[homeTeamId][matchId] = seasonId }

  ack { ok: true, matchId }
}
```

## Operators

| Surface | Lowers to |
|---------|-----------|
| `x = pstate[k]` (read) | `(local-select> (keypath k) $$pstate :> *x)` |
| `pstate[k] = { ... }` | `(local-transform> [(keypath k) (multi-path [field (termval v)] ...)] $$pstate)` |
| `pstate[k] <- { ... }` | same, but merge (only listed fields) |
| `pstate[k].f += n` | `[(keypath k "f") (nil->val <schema-zero>) (term #(+ % n))]` |
| `list push item` | `[... AFTER-ELEM (termval item)]` (never inside keypath) |
| `x ?? d` | `(nil->val d)` in paths; `(or> x d)` in exprs |
| `pstate[k] exists` | select + `(some? ...)` |
| `k in set` / `not in` | `(contains? set k)` / negation |
| `at partition(k) { ... }` | `(|hash k)` + body (reads and writes inside are post-hop) |
| `fail "msg" if cond` | error-accumulator + flat `(<<if (some? *err) (ack-return> {"ok" false "error" *err}) (else>) ...)` |
| `ack { ... }` | `(ack-return> {...})` |
| `on depot "type" { fields } { ... }` | `<<sources` branch on `(= *type ...)` + destructured gets |
| `depot d keyed by f` | `(declare-depot setup *d (hash-by f-extractor))` |

## Checker upgrades implied

- Lint: parallel single-field transforms to same `pstate[k]` → suggest record assign / `multi-path` (transitional, for v1 files)
- Schema-aware `+=`: numeric fields get zero-defaults; non-numeric `+=` is a type error
- `at partition(k)`: selects on pstates keyed by something other than `k` outside a matching `at` block → error ("reads must hop too")
- Guard depth: `fail` chains keep IR flat; nested `if` beyond 2 levels is a compile error (Clojure target constraint, enforced at source)
