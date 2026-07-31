# .rama v2 — design notes (reviewed)

Strip naming conventions and compiler noise. **Specter stays the user-facing
path API** (`-->` / `!<--`, navigators, `keypath`, `termval`, …). Schemas look
like Rust. Topologies stay tiny. The Rust program owns lowering.

## Resolved

| Topic | Decision |
|-------|----------|
| Naming (`*var`, `%fn`, trailing `>` on ops) | gone |
| `ramaop` / `ramafn` | one keyword: `op` |
| Destructuring | `let {a, b} = event` — keep |
| Select bind | `$$p --> keypath(id) > { a, b }` — beauty, keep |
| Path writes | Specter; navigators as siblings — keep |
| Fixed-keys write | **whole-map `termval({…})`**, not N transforms / required `multi-path` |
| Validation | `fail "msg" if cond` — prefer over nested ifs (deep `if` still legal) |
| Ack | **`return`** (emits `ack-return>`) |
| Map literals | Clojure style `{"ok" true}` / `{:status "UNPLAYED"}` |
| PState types | **Rust-like**: `struct` + `pstate name: Map<K, V>` — not `String -> fixed` |
| Fixed-keys field names | **keywords** (normal Rama); REST modules may still choose strings |
| Partition hop | bare `\|hash k` for now (open) |
| Deep `if` | must work; Clojure SO is an emitter problem |
| `$$` on pstates | **keep** — marks distributed state; decls + use sites |

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

Because we **transpile to Clojure source**, most of the seam is already gone:
`(inc turn)`, `(contains? remaining arenaId)`, and a user helper are all just
Clojure lists in the output. Dataflow ops (`local-select>`, `<<if`, `|hash`)
are also Clojure. The surface only special-cases what Rama macros need
(`-->` / `!<--` / `fail` / `return` / bind `>`).

### Layers (one file, one language)

| Form | Meaning | Emits |
|------|---------|-------|
| `struct` / `pstate` / `depot` | decls | `declare-pstate` / `declare-depot` |
| `op name(…) {…}` | dataflow fragment | `deframaop` / body in `<<sources` |
| `fn name(…) {…}` | plain Clojure function | `defn` — callable from `op` with zero ceremony |
| expression call `foo(a, b)` | opaque | `(foo a b)` — Rama op, Clojure fn, or Java interop; reader decides |
| `clojure { … }` | **escape hatch only** | splice raw Clojure forms verbatim (macros, weird reader tricks) |

No ghetto: you should almost never need `clojure { }`. Prefer `fn` for helpers
(`ban-error`, `score-error`) written in `.rama` control flow that lowers to
normal Clojure (`if`/`cond`/`and`/`or` — not `and>`), and call them from `op`
exactly like today's MatchModule.

```rama
fn ban-error(turn, home, away, teamId, remaining, arenaId) {
  if (turn == nil) { return "no-ban-state" }
  if (teamId != (even?(turn) ? away : home)) { return "not-your-turn" }
  if (not(contains?(remaining, arenaId))) { return "arena-not-in-pool" }
  return nil
}

op ban-map(event) {
  let { matchId, teamId, arenaId } = event
  $$mapBans --> keypath(matchId) > { turn, homeTeamId, awayTeamId, remaining }
  fail ban-error(turn, homeTeamId, awayTeamId, teamId, remaining, arenaId)
  // …
}
```

`fail <expr>` — if expr is non-nil string, `return {"ok" false "error" expr}`.
Same idea as today's `ban-error :> *err` + `<<if (some? *err)`.

Escape hatch when the grammar can't say it:

```rama
fn half-uuid(id) {
  clojure { (h/half-uuid id) }
}
```

### What “invisible” means for the compiler

1. **Don't classify callees** in the typechecker unless declared — unknown
   `foo(…)` emits `(foo …)` and Clojure resolves it.
2. **`fn` vs `op`** is the only intentional seam: stack/CPS/`and>` rules apply
   inside `op`; normal Clojure evaluation inside `fn`.
3. **Hole-punch is textual** in v1 of the emitter (transpiler). No bytecode.
4. Extensibility test: a `.rama` file can grow a plain `fn` + `op` that calls
   it, transpile, and `lein test-rama` green — without `clojure { }`.

## Open

1. Bare `|hash k` vs block — lean bare until a meatier module decides
2. REST string-key modules — `:field` vs `"field"` (mge.tf REST wants strings)

## Next work (priority)

1. **Clojure seam** — locked above; keep `clojure { }` minimal.
2. **v2 parse + emit** — accept `match_v2.rama`, emit real MatchModule Clojure.
3. **Topology tests** — transpile → drop into `rama/` test harness /
   `InProcessCluster` (the proof, not unit-snapshots of strings alone).
4. **Typechecker** — deepen against `struct` / `Map<…>` / Specter paths once
   v2 parse exists (navigator-in-keypath, fixed-keys fields, `fail` expr type).

See `fixtures/match_v2.rama`.
