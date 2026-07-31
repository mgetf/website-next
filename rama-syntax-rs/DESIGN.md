# .rama v2 — design notes (reviewed)

**v2 is the only dialect.** No legacy surface, no trailing `>` on ops, no `*var`
sigils in source. Strip naming conventions in the **emitter**; keep Specter as
the user-facing path API (`-->` / `!<--`, navigators, `keypath`, `termval`, …).
Schemas look like Rust. Topologies stay tiny.

Stack: **logos** lexer + **chumsky** parser → syntax AST → semantic **Rama IR**
(`rama_ir::Program`) → Rama rules → **Clojure IR** (`clj::Form`) → compiler
invariant verification → pretty-printed source. Compilation is between IRs;
string construction exists only in the final serializer.

## Resolved

| Topic                                       | Decision                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| Naming (`*var`, `%fn`, trailing `>` on ops) | gone                                                                           |
| `ramaop` / `ramafn`                         | one keyword: `op`                                                              |
| Destructuring                               | `let {a, b} = event` — keep                                                    |
| Select bind                                 | `$$p --> keypath(id) > { a, b }` — beauty, keep                                |
| Path writes                                 | Specter; navigators as siblings — keep                                         |
| Fixed-keys write                            | **whole-map `termval({…})`**, not N transforms / required `multi-path`         |
| Validation                                  | `fail "msg" if cond` — prefer over nested ifs (deep `if` still legal)          |
| Ack                                         | **`return`** (emits `ack-return>`)                                             |
| Map literals                                | Clojure style `{"ok" true}` / `{:status "UNPLAYED"}`                           |
| PState types                                | **Rust-like**: `struct` + `pstate name: Map<K, V>` — not `String -> fixed`     |
| Fixed-keys field names                      | `:field` in surface syntax; lower to **string keys** for the REST-first target |
| Partition hop                               | bare `\|hash k` for now (open)                                                 |
| Deep `if`                                   | must work; Clojure SO is an emitter problem                                    |
| `$$` on pstates                             | **keep** — marks distributed state; decls + use sites                          |

## Schemas (Rust-shaped)

Alien (rejected):

```rama
pstate $$matches { String -> fixed { "status" String } }
pstate $$matches-by-team { String -> map String }   // meaningless
```

Target:

```rama
struct Match {
  :homeTeamId String
  :awayTeamId String
  :seasonId   String
  :status     String
  :homeScore  Long
  :awayScore  Long
  :winnerId   String
  :boGames    Long
}

struct MapBan {
  :turn       Long
  :homeTeamId String
  :awayTeamId String
  :remaining  Object
  :actions    Object
}

struct TeamStats {
  :wins   Long
  :losses Long
  :points Long
}

pstate $$matches:       Map<String, Match>
pstate $$mapBans:       Map<String, MapBan>
pstate $$teamStats:     Map<String, TeamStats>
pstate $$matchesByTeam: Map<String, Map<String, String>> @subindexed
```

Lowering: `Map<K, Struct>` → `{K (fixed-keys-schema {…})}`; nested
`Map<K, Map<K2, V>> @subindexed` → `(map-schema K2 V {:subindex? true})`.
`$$` is part of the name — decls and `-->` / `!<--` use sites both keep it.

## Fixed-keys write = set the map

You do **not** have to explode into `multi-path` field-by-field. Whole-map
`termval` is the concise form (and should work):

```rama
$$matches !<-- keypath(matchId), termval({
  :homeTeamId homeTeamId
  :awayTeamId awayTeamId
  :seasonId   seasonId
  :status     "UNPLAYED"
  :homeScore  0
  :awayScore  0
  :boGames    bo
})
```

`multi-path` remains available when you only patch some fields.

## Topology style

```rama
$$mapBans --> keypath(matchId) > { turn, homeTeamId, awayTeamId, remaining }

fail "no-ban-state" if turn == nil
fail "not-your-turn" if teamId != (even?(turn) ? awayTeamId : homeTeamId)
fail "arena-not-in-pool" if not(contains?(remaining, arenaId))

$$mapBans !<-- keypath(matchId, :actions), AFTER-ELEM, termval({:teamId teamId :arenaId arenaId})

return {"ok" true "matchId" matchId "banned" arenaId}
```

## Emitter owns

- Insert `:>` / `$$` / trailing `>` where Clojure-Rama requires them
- `return m` → `(ack-return> m)`
- `fail "e" if c` → flat error branch (never nested-`<<if` pyramids unless user wrote `if`)
- `struct` / `Map<…>` → `fixed-keys-schema` / `map-schema`
- Keyword keys in schemas ↔ path segments `:field`

## Clojure seam (invisible by default)

Clojure is **expression-only** — no `return`. .rama surface is statement-shaped
(`let`, `if`, `return`, `fail`). The seam must not leak: emitted `defn` bodies
are normal Clojure expressions. That is a **compiler pass**, not ANF-by-default.

### `return` is context-sensitive

| Enclosing form | Surface `return x` becomes                                        |
| -------------- | ----------------------------------------------------------------- |
| `fn`           | the **value** of that control-flow path — never a `return` symbol |
| `op`           | `(ack-return> x)` — dataflow effect                               |

Same keyword; different lowering. User does not think about it.

### Statement → expression pass (for `fn`)

Not full A-normal form unless we need it later. The pass is **block
elaboration** / **tailification**:

1. `let a = e1; …; rest` → `(let [a e1] …rest…)`
2. `if (c) { … return a } else { … return b }` → `(if c …a… …b…)`
3. Early `return` mid-block → nest the remainder under `if` / use `cond`
4. Final expression (or final `return`) is the block’s value

```rama
fn ban-error(turn, home, away, teamId, remaining, arenaId) {
  if (turn == nil) { return "no-ban-state" }
  if (teamId != (even?(turn) ? away : home)) { return "not-your-turn" }
  if (not(contains?(remaining, arenaId))) { return "arena-not-in-pool" }
  return nil
}
```

→

```clojure
(defn ban-error [turn home away teamId remaining arenaId]
  (cond
    (nil? turn) "no-ban-state"
    (not= teamId (if (even? turn) away home)) "not-your-turn"
    (not (contains? remaining arenaId)) "arena-not-in-pool"
    :else nil))
```

No `return` in the output. Invisible.

ANF (`let` every subexpression) is optional later for analysis; **not** required
to erase `return`. Cond/if nesting is enough for the MatchModule helper style.

### Layers (one file, one language)

| Form                          | Meaning           | Emits                                                      |
| ----------------------------- | ----------------- | ---------------------------------------------------------- |
| `struct` / `pstate` / `depot` | decls             | `declare-pstate` / `declare-depot`                         |
| `op name(…) {…}`              | dataflow          | `deframaop`; `return` → `ack-return>`; `and>` where needed |
| `fn name(…) {…}`              | plain Clojure     | `defn`; statement→expression pass; `and`/`or`/`if`         |
| call `foo(a, b)`              | opaque            | `(foo a b)` — reader/resolve decides                       |
| `clojure { … }`               | escape hatch only | splice raw forms                                           |

`fail <expr>` in `op` — if expr is non-nil, `return {"ok" false "error" expr}`
(dataflow). In `fn`, prefer ordinary `if`/`return` — `fail` is an `op`-level sugar.

### What “invisible” means

1. Emitted `fn` bodies are idiomatic Clojure — no fake `return`, no dataflow ops.
2. **`fn` vs `op`** is the only intentional seam (evaluation model), and even that
   is one keyword difference in source.
3. Unknown calls stay unresolved names; Clojure resolves them.
4. Proof: `fn ban-error` + `op ban-map` that calls it → `lein test-rama` green.

## Validation layers

- `rules/`: source-spanned user diagnostics over semantic Rama IR.
- `clj_verify.rs`: compiler assertions over generated Clojure IR.
- `tests/rama_smoke.rs`: ignored-by-default real Rama/InProcessCluster proof.

See `RULES.md` for the classification and current rule inventory.

## Open

1. Bare `|hash k` vs block — lean bare until a meatier module decides

## Next work (priority)

1. **Generated lifecycle proof** — create/ban/score is green via
   `cargo test --test rama_smoke -- --ignored`.
2. **Typechecker** — deepen against `struct` / `Map<…>` / Specter paths.
3. **Module identity** — separate Clojure namespace, module class, and topology
   name instead of deriving all three from `module Match`.
4. **Cross-partition analysis** — track partition key flow so missing `|hash`
   before local reads/writes becomes a Rama IR diagnostic.

See `fixtures/match_v2.rama`.
