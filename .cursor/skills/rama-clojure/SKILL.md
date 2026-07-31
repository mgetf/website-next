---
name: rama-clojure
description: Write effective Rama Clojure modules for mge.tf using REST-first JSON maps, shallow dataflow, and the hard-won gotchas from the MatchModule spike. Use when editing rama/, writing defmodule/<<sources/PStates/depots, TypeScript Rama REST clients, or cutting Postgres paths over to Rama.
---

# Rama Clojure (mge.tf)

Pride rule: **Clojure module only. TypeScript talks only via Rama's built-in REST JSON API.** No custom HTTP in Clojure. No gRPC.

Canonical spike: `rama/src/mge/tf/rama/match_module.clj`  
Client: `src/lib/server/rama/`  
Docs: `rama/README.md`, [knots reference](reference.md)

## Design order

1. List **queries** the UI needs
2. Shape **PStates** for those reads (string keys, REST-friendly)
3. Choose **depots** so ordering constraints hold (`hash-by` the entity id)
4. Write a **shallow** stream topology that append → validate → `local-transform>` → `ack-return>`

## REST-first data

- Events are **plain maps with string keys** — never Clojure records for client-facing events
- Extract with `(get *event "matchId" :> *match-id)`
- PState `fixed-keys-schema` uses **string** field names so JSON paths `["m1","status"]` work
- Numbers from JSON are 32-bit ints; coerce with `(long …)` / helpers; TS sends longs as `"#__L2"` via `ramaLong()`
- Module name `mge.tf.rama.match-module/MatchModule` → URL `%2F` for `/`
- Append body: `{"data":{…},"ackLevel":"ack"}`; ack returns keyed by **topology name** (`"matches"`)

## Dataflow rules that will save you hours

### Use `and>` / `or>` — never `and` / `or`

Clojure `and`/`or` expand to `let*`. Dataflow cannot resolve `let*` → compile error *"Unable to resolve symbol: let*"*.

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
(defn ban-error [turn home away team-id remaining arena-id]
  (cond
    (nil? turn) "no-ban-state"
    (not= team-id (if (even? (long turn)) away home)) "not-your-turn"
    (not (contains? remaining arena-id)) "arena-not-in-pool"
    :else nil))

;; dataflow:
(ban-error *turn *home *away *team-id *remaining *arena-id :> *err)
(<<if (some? *err)
  (ack-return> {"ok" false "error" *err})
 (else>)
  ;; transforms + success ack
  )
```

Inside helper `defn`s, normal Clojure `and`/`or`/`cond` are fine.

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
      (<<if (and> (not= *type "upsert") …)
        (ack-return> {"ok" false "error" "unknown-type"})))))
```

Ack shape for TS: always `{"ok" bool, "error"? string, …}`. Topology name is the ack map key.

## TypeScript client

- Use `RamaClient` in `src/lib/server/rama/client.ts`
- `ackLevel: "ack"` for interactive UI writes
- Discover supervisors via Conductor `308` + `Supervisor-Locations`; don't hammer Conductor
- Path = JSON list of navigators: `[matchId, "status"]`, `[matchId, "remaining"]`

## Test loop

```bash
cd rama && lein test-rama
```

Use `InProcessCluster` + `foreign-append!` / `foreign-select-one` with the **same string-key maps** REST will send.

## Cutover discipline

- One vertical slice per PR (matches → users → teams → payments → notifications)
- Edge stays SvelteKit (Steam/Discord/R2); Rama owns durable domain state
- Do not dual-write forever — flip the route, then delete the Prisma path

## More knots

See [reference.md](reference.md) for the full scar list and REST path cheat sheet.
