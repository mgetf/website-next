---
name: rama-clojure
description: Write effective Rama Clojure modules for mge.tf using REST-first JSON maps, shallow dataflow, and the hard-won gotchas from MatchModule / DemosModule / god-path cutover. Use when editing rama/, writing defmodule/<<sources/PStates/depots, TypeScript Rama REST clients, or cutting Postgres paths over to Rama.
---

# Rama Clojure (mge.tf)

Pride rule: **Clojure module only. TypeScript talks only via Rama's built-in REST JSON API.** No custom HTTP in Clojure. No gRPC. No Prisma facade / in-memory shim.

Canonical modules: `rama/src/mge/tf/rama/*_module.clj`  
Clients: `src/lib/server/rama/`  
Cluster: `scripts/rama-cluster.sh`  
Docs: `rama/README.md`, [knots reference](reference.md)

## Design order

1. List **queries** the UI needs
2. Shape **PStates** for those reads (string keys, REST-friendly)
3. Choose **depots** so ordering constraints hold (`hash-by` the entity id — see partition gotchas)
4. Write a **shallow** stream topology that append → validate → `local-transform>` → `ack-return>`

## REST-first data

- Events are **plain maps with string keys** — never Clojure records for client-facing events
- Extract with `(get *event "matchId" :> *match-id)`
- PState `fixed-keys-schema` uses **string** field names so JSON paths `["m1","status"]` work
- Numbers from JSON are 32-bit ints; coerce with `(long …)` / helpers; TS sends longs as `"#__L2"` via `ramaLong()`
- Module name `mge.tf.rama.match-module/MatchModule` → URL `%2F` for `/`
- Append body: `{"data":{…},"ackLevel":"ack"}`; ack returns keyed by **topology name** (`"matches"`, `"demos"`)

## Dataflow rules that will save you hours

### Use `and>` / `or>` — never `and` / `or`

Clojure `and`/`or` expand to `let*`. Dataflow cannot resolve `let*` → compile error _"Unable to resolve symbol: let_"*.

```clojure
;; ❌
(<<if (and (>= *a *b) (> *a *c)) …)

;; ✅
(<<if (and> (>= *a *b) (> *a *c)) …)
;; or better: push the predicate into a plain defn (see below)
```

### Keep `<<if` shallow (≤2 levels)

Deep nesting → **StackOverflowError** in `clojure.algo.monads` at compile time.

Push validation into top-level `defn`s that return an error string or `nil`:

```clojure
(defn ban-error [turn home away team-id remaining arena-id complete]
  (cond
    (nil? turn) "no-ban-state"
    (true? complete) "ban-complete"
    (not= team-id (expected-team turn home away)) "not-your-turn"
    (not (contains? remaining arena-id)) "arena-not-in-pool"
    :else nil))

;; dataflow:
(ban-error *turn *home *away *team-id *remaining *arena-id *complete :> *err)
(<<if (some? *err)
  (ack-return> {"ok" false "error" *err})
 (else>)
  ;; transforms + success ack
  )
```

Inside helper `defn`s, normal Clojure `and`/`or`/`cond` are fine.

### No nested Clojure forms as dataflow ops inside `<<if`/`else>`

Inside a Rama dataflow branch, do **not** use nested Clojure `or` / `count` / `>=` as if they were dataflow ops. They either expand to `let*` or confuse the compiler. Wrap them in pure helpers and call `(helper *x :> *out)`.

```clojure
;; ❌ inside <<if / else>
(count (or *actions []))
(>= *next-count 6)

;; ✅
(actions-count *actions :> *action-count)
(ban-now-complete? *next-count *bo-series :> *now-complete)
```

Prefer `multi-path` for multi-field writes (keeps the tree compact; helps with `-Xss8m` AOT).

### Navigators do not go inside `keypath`

```clojure
;; ❌ AFTER-ELEM treated as a map key → "Key must be integer" / worker death
[(keypath *id "actions" AFTER-ELEM) (termval row)]

;; ✅
[(keypath *id "actions") AFTER-ELEM (termval row)]
```

Same idea for `NONE-ELEM`, `NONE>`, `ALL`, etc. — they are path steps, not keys.

### `hash-by` needs a top-level `defn`

```clojure
(defn match-id [event] (get event "matchId"))
(declare-depot setup *match-depot (hash-by match-id))
```

Keywords work for record/keyword maps; we use `defn` + string keys for REST.

### Depot `hash-by` must match every event that shares a PState row

Silent `*-not-found` after a successful create/write almost always means **wrong partition**.

If event A writes by `demoId` and event B resolves by `reportId` only, they land on different tasks unless the partitioner prefers a shared key:

```clojure
;; DemosModule: report + resolve share reportId; create (no reportId) falls back to demoId
(defn demo-id [event]
  (or (get event "reportId") (get event "demoId")))
```

Rules of thumb:

- Prefer the id of the **row being mutated** for that event type
- When create/update/resolve touch the same PState, they must hash to the **same** key
- Cross-entity indexes (`$$reports-by-status`, `$$demos-by-match`) are fine via `|hash` after the primary write
- Do **not** `local-select>` a row that lives on another partition without `|hash` first — or skip the check and validate in TS

### Don't fan-out then ack

`ops/explode` multiplies the stream. Anything after it (including `|hash` and `ack-return>`) runs **per element** → duplicate acks / crashes.

Prefer one-shot collection writes for small data:

```clojure
(pool->set *pool :> *pool-set)
(local-transform> [(keypath *id "remaining") (termval *pool-set)] $$map-bans)
```

If you must explode, isolate with `anchor>` / `<<branch` and put `ack-return>` only on the non-explode branch.

### Counter / init pattern

```clojure
(local-transform>
 [(keypath *team-id "wins") (nil->val 0) (term inc)]
 $$team-stats)
```

Transform paths must end in `term` / `termval` / `NONE>` — `(nil->val 0)` alone is not a write.

### Cross-partition updates **and reads**

Depot lands on one task (`hash-by matchId` / `steamId`). To touch another entity:

```clojure
(|hash *winner-id)
(local-transform> [(keypath *winner-id "wins") (nil->val 0) (term inc)] $$team-stats)
```

**Reads must hop too.** A `local-select>` on `$$discord-by-id` while still on the steamId task reads the wrong partition — uniqueness checks silently fail. `|hash` the index key before select.

Unknown-event fallback: prefer `(known-type? *type)` over a six-way `and>` of `not=`.

## Domain patterns (god-path)

### Map bans (`$$map-bans`)

- `turn` is **0 = home / 1 = away** (not action index). Create starts at **1 (away)**.
- Bo3 sequence matches Prisma: Away ban → Home ban → Home pick → Away pick → Away ban → Home pick (6 actions).
- Switch helpers live in Clojure (`should-switch-turn`, `next-turn`, `ban-now-complete?`).
- Clojure does **not** enforce ban-vs-pick sequence — validate `actionType` in TS with `determineNextAction`.
- `create-match` always writes a `$$map-bans` row. **Empty pool + no actions → TS `getMapBanStatus` returns `null`** so week matches with a fixed arena hide the map-ban UI.
- Synthesize `matchMapBan.id = matchId` under Rama so existing form actions keep working.

### Playoffs without a PlayoffsModule

- Soft synthetic config: `playoff.id === seasonId` from `getPlayoffBySeason`.
- Create via `createMatch` with **`weekNo: 0`** so `$$matches-by-week` keys `"{seasonId}:0"` — E2E/admin can find playoff matches without a separate index.
- `boGames` field on the match stores series length (Bo3 → `3`); score validation is series-level, not per-game rows.

### Scores / standings

- MatchModule scores are **series totals** vs `boGames` (`>= boGames && > opponent`). Bo1 frag sums (8–2) still pass when `boGames=1`.
- Standings hydrate from `$$team-stats` (`wins` / `losses` / `points`) — no PPG detail unless you extend the module.
- Soft-default modules that don't exist yet (`getGlobalSettings`, staff lists) rather than hitting the Prisma hard-error proxy.

### Demos / form IDs

- Demo + report ids must be **numeric strings** (`String(Date.now() * 1000 + …)`). Route schemas use `z.coerce.number()` — hyphenated ids become `NaN`.
- Topology ack key is `"demos"` (stream topology name), not the module name.

## TypeScript cutover pattern

```ts
const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
if (isRamaBackend()) {
  const { createMatchClient, banMap, getMapBan } = await import('$lib/server/rama/match');
  const client = createMatchClient(ramaClientOpts());
  // append / selectOne → map to the Prisma-shaped DTO the UI already expects
}
```

- `isRamaBackend()` is **flag-only** (`DATA_BACKEND=rama` / `rama-rest`). Under Rama, `prisma` is a hard-error proxy — never dual-write.
- Route `load` / actions stay thin; all REST lives in services + `src/lib/server/rama/*`.
- Return plain serializable shapes (no Prisma relations).

## Module skeleton

```clojure
(ns mge.tf.rama.foo-module
  (:use [com.rpl.rama]
        [com.rpl.rama.path]))

(defn entity-id [event] (get event "id"))

(defmodule FooModule
  [setup topologies]
  (declare-depot setup *foo-depot (hash-by entity-id))
  (let [s (stream-topology topologies "foo")]
    (declare-pstate s $$foos
      {String (fixed-keys-schema {"status" String})})
    (<<sources s
      (source> *foo-depot :> *event)
      (get *event "type" :> *type)
      (get *event "id" :> *id)
      (<<if (= *type "upsert")
        ;; validate via defn → local-transform> → ack-return>
        (ack-return> {"ok" true "id" *id}))
      (<<if (not (known-type? *type))
        (ack-return> {"ok" false "error" "unknown-type"})))))
```

Ack shape for TS: always `{"ok" bool, "error"? string, …}`. Topology name is the ack map key.

## TypeScript client

- Use `RamaClient` in `src/lib/server/rama/client.ts`
- `ackLevel: "ack"` for interactive UI writes
- Discover supervisors via Conductor `308` + `Supervisor-Locations`; don't hammer Conductor
- Path = JSON list of navigators: `[matchId, "status"]`, `[matchId, "remaining"]`

## Build / cluster

```bash
cd rama && lein test-rama          # InProcessCluster
cd rama && lein uberjar-modules    # → rama/target/mge-rama.jar
FORCE_REDEPLOY=1 bash scripts/rama-cluster.sh deploy
```

- JVM needs **`-Xss8m`** (`rama/project.clj`) — dataflow macroexpansion is stack-hungry
- Register new modules in **both** `:uberjar :aot` and `scripts/rama-cluster.sh` `MODULES`
- Destroy for redeploy needs stdin confirm: `printf '%s\n' "$mod" | ./rama destroy "$mod"`
- `FORCE_REDEPLOY=1` wipes module data — E2E must reseed

## Test loop

```bash
cd rama && lein test-rama
# or one ns:
cd rama && lein test-rama :only mge.tf.rama.demos-module-test
```

Use `InProcessCluster` + `foreign-append!` / `foreign-select-one` with the **same string-key maps** REST will send. Read acks with `(get (foreign-append! depot event) "demos")` (topology name).

## Cutover discipline

- One vertical slice per PR (matches → users → teams → … → demos / playoffs / standings)
- Edge stays SvelteKit (Steam/Discord/R2); Rama owns durable domain state
- Soft-stub missing modules; do not dual-write forever — flip the route, then delete the Prisma path
- After TS changes: `bun run format && bun run check && bun run boundary-check && bun run knip`

## More knots

See [reference.md](reference.md) for the full scar list and REST path cheat sheet.
