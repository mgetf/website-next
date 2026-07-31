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

## Open

1. Bare `|hash k` vs block — lean bare until a meatier module decides
2. REST string-key modules — same syntax with `"homeTeamId"` instead of `:homeTeamId`, or a schema attribute?

See `fixtures/match_v2.rama`.
