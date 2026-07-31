# .rama v2 — design notes (reviewed)

Rule: **strip naming conventions and compiler noise; keep Specter as the
user-facing path API.** Select/transform sigils stay. The Rust program owns
lowering nits (`:>` bindings, `$$` prefixes, trailing `>` emit names, etc.).

## Spec review (resolved)

| # | Proposal | Verdict |
|---|----------|---------|
| 1 | Kill sigil soup / naming conventions (`*var`, `%fn`, trailing `>` on ops) | **yes** |
| 2 | Destructuring close to JS semantics (incl. handler heads) | **yes** |
| 3 | Drop trailing `>` vocabulary (`ack-return>` → `ack`, one op keyword) | **yes** |
| 4 | JS-style `matches[id] = {…}` instead of path writes | **no** — record assignment is `multi-path` over fixed-keys-schema; Specter stays |
| 5 | Replace `-->` / `!<--` with JS subscript lvalues | **no** — Specter paths + navigators *are* the beauty; select/transform sigils stay |
| 6 | Soften navigator vocab / sugar `+=` / `push` | **open** — need a complex module both ways; lean keep navigators bare |
| 7 | `at partition(k) {…}` block vs bare `|hash k` | **open** — lean **bare statement** is better; compare on a real cross-partition module |
| 8 | Cap deep `if` because Clojure `<<if` can SO | **no** — deep `if` **must** work in `.rama`; SO is a target bug, compiler emits a safe shape |
| 9 | JS object literals `{ ok: true }` | **no** — Clojure map literals `{"ok" true}` are better |
| 10 | Drop `ramaop` vs `ramafn` | **yes** — one construct; emit-shape inferred |

## What stays beautiful (do not touch)

- Specter paths as the user-facing API: `keypath`, `multi-path`, `termval`,
  `term`, `nil->val`, `AFTER-ELEM`, `NONE>`, `selected?`, `MAP-VALS`, …
- Select / transform sigils: `$$matches --> …` and `$$matches !<-- …`
  (pstate sigil `$$` is still open — declaration-scoped names may drop it later;
  path ops do not)
- Comma-separated path steps (navigators as **siblings**, never inside `keypath`)
- Clojure map literals: `{"ok" true "matchId" matchId}`

## What the Rust program strips / owns

| Surface noise (v1) | v2 |
|--------------------|----|
| `*match-id`, `%update` | `match-id` / `update` — locals are just names |
| `ack-return>`, `send-emits>`, `unify>` | `ack`, `emit`, `unify` — emit-shape is inferred |
| `ramaop` / `ramafn` | `op` (or `flow`) — one keyword |
| Stacked `get(event, "f") > f` | Destructure: `on depot "type" { matchId, homeTeamId, … }` |
| N single-field `!<--` to one fixed-keys entity | Prefer one `!<-- keypath(id), multi-path([…], […])` (already Specter) |
| Deep `<<if` SO on Clojure | Emit flat / CPS-safe IR; **source may nest freely** |
| Binding pipe `:>` in emitted Clojure | Inserted by emitter, not typed in `.rama` (or keep a single `>` bind if useful) |

## v2 sketch

See `fixtures/match_v2.rama` (aspirational — parser does not accept it yet).

```rama
op create-match(event) {
  let { matchId, homeTeamId, awayTeamId, seasonId, boGames, pool } = event

  $$matches --> keypath(matchId) > existing
  if (nil?(existing)) {
    $$matches !<-- keypath(matchId), multi-path(
      ["homeTeamId" termval(homeTeamId)]
      ["awayTeamId" termval(awayTeamId)]
      ["seasonId" termval(seasonId)]
      ["status" termval("UNPLAYED")]
      ["homeScore" termval(0)]
      ["awayScore" termval(0)]
      ["boGames" termval(long(boGames))]
    )
    |hash homeTeamId
    $$matches-by-team !<-- keypath(homeTeamId, matchId), termval(seasonId)
    ack {"ok" true "matchId" matchId}
  } else {
    ack {"ok" false "error" "match-exists"}
  }
}
```

Notes vs the rejected JS rewrite:
- Paths stay paths. `multi-path` *is* the record assignment for fixed-keys-schema.
- `|hash homeTeamId` left as a bare statement pending a side-by-side on a meatier module.
- Nested `if` is legal; emitter must not blow the Clojure stack.

## Open questions (need examples)

1. **Navigators vs sugar** — keep `AFTER-ELEM` / `nil->val` bare, or allow
   `actions, AFTER-ELEM, termval(…)` only (no `push` / `+=`)? Lean bare.
2. **Partition hop** — bare `|hash k` vs `at partition(k) {…}`. Lean bare.
3. **`$$` on pstates** — keep for “this is distributed state” readability, or
   drop once `pstate` decls are in scope?
4. **Bind operator** — keep `> name` after select/effects, or `let name = …`?

## Checker (revised)

- Lint parallel single-field transforms against the same `keypath(id)` on a
  fixed-keys pstate → suggest `multi-path` collapse (does not invent JS assign).
- Navigator-inside-`keypath` remains a hard error (MatchModule scar).
- Transform must terminate in `term` / `termval` / `NONE>` / `multi-path`.
- Deep `if`: allowed; if target Clojure SO’s, fix emission, don’t reject source.
- No JS-object / no subscript-lvalue lint — those are not the language.
