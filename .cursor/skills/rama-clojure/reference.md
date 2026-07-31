# Rama knots (scar tissue from MatchModule / DemosModule / god-path)

Hard failures we hit while cutting `rama/src/mge/tf/rama/*_module.clj` and the TypeScript services. Read when something weird breaks.

## Compile-time

| Symptom                                          | Cause                                                                | Fix                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------- |
| `Unable to resolve symbol: let* in this context` | Used Clojure `and`/`or`/`if-let`/`when-let` in dataflow              | Use `and>` / `or>` / `<<if`, or move logic to `defn`  |
| Same `let*` error from `(or *x "")` in a transform | Clojure `or`/`and` expand to `let*` even outside `<<if` predicates | `(defn str-or-empty [v] …)` then call it in dataflow  |
| `StackOverflowError` in `clojure.algo.monads`    | Deep nested `<<if` / `<<switch` / `<<cond`                           | ≤2 levels of dataflow branching; helpers for the rest |
| StackOverflow during **AOT** / uberjar             | Same nesting + large `multi-path` trees                              | `-Xss8m` in `project.clj`; compact helpers            |
| Nested `(count (or …))` / `(>= …)` inside `<<if`   | Treated as dataflow forms; expands badly                             | Pure `defn` helpers: `(eds-count *a :> *n)`       |
| `EOF while reading`                              | Unbalanced parens after editing `<<if` trees                         | Count closers carefully; prefer flatter code          |
| Minimal module works, big one doesn't            | Almost always `and` or nesting — bisect by commenting event handlers | Add one `<<if (= *type …)` handler at a time          |

## Runtime / worker death

| Symptom                                                                                                         | Cause                                                                                                                   | Fix                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Key must be integer` on ban/list update                                                                        | `AFTER-ELEM` (or similar) passed **into** `keypath`                                                                     | `[(keypath id "actions") AFTER-ELEM (termval row)]`                                                                          |
| `CallbackException` / connection closed on append                                                               | Topology threw; worker watchdog killed the task                                                                         | Check worker ERROR logs above the test failure                                                                               |
| Duplicate / flaky ack after create                                                                              | `ops/explode` then `ack-return>` on same lineage                                                                        | Write whole set with `termval`, or `anchor>`/`<<branch`                                                                      |
| Registration-style races                                                                                        | Wrong depot partitioner                                                                                                 | `hash-by` the entity whose serializability you need                                                                          |
| Uniqueness check always passes / never sees existing                                                            | `local-select>` on wrong partition (still on depot key)                                                                 | `\|hash` the index key **before** reading that PState                                                                        |
| Write after `\|hash` inside a `deframaop` vanishes (ack ok, in-op readback sees it, nothing committed anywhere) | PState passed as a **deframaop parameter**, accessed after a partitioner hop — the parameter reference is not hop-aware | Inline the hopping code in the topology (or `<<with-substitutions`); PState params are fine only when no partitioner follows |
| `StackOverflowError` in `rpl.rama.util.parse` at module launch                                                  | Many sequential `<<if` dispatch branches with nested guards compile as nested continuations                             | Dispatch on one discriminator with flat `<<switch` + `(case> …)`                                                             |
| `ok: false` / `report-not-found` after successful report | Resolve hashed by `reportId`, report hashed by `demoId` | Prefer shared key in `hash-by` (`reportId` first); include that id on every event     |
| Create works, later op can't see row                     | Same partition mismatch                                 | Log `(hash-by)` keys for each `type`; they must agree for shared PState writes        |
| Giant `and>` of many `not=` for unknown-type                                                                    | Parser / compile pain                                                                                                   | `(defn known-type? [t] (contains? #{…} t))` then `(<<if (not (known-type? *type)) …)`                                        |

## Schema / path

| Symptom                                             | Cause                                                             | Fix                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| REST `selectOne` returns null for a field you wrote | Keyword keys in PState, string navigators in JSON (or vice versa) | String keys end-to-end for REST-first modules                    |
| Long fields wrong / type errors                     | JSON number → Integer, schema expects Long                        | `(long v)` in topology; `"#__L…"` from TS                        |
| Subindexed set pain for 5–7 items                   | Over-engineering                                                  | Store as `Object` + Clojure set via `termval`                    |
| `nil->val` "didn't write"                           | View navigator without term                                       | End with `(term identity)` or `(term inc)` / `termval`           |
| Form action `Invalid demo/report ID`                | Hyphenated id + `z.coerce.number()` → `NaN`                       | Numeric-only string ids (`Date.now()*1000+rand`)                 |
| Map-ban UI shows on week match with fixed arena     | `create-match` always writes `$$map-bans`                         | TS: return `null` when `remaining` empty and no actions          |
| Map-ban turn wrong vs Prisma                        | Encoded turn as action index                                      | `0=home`, `1=away`; start at `1`; switch after `{0,2,4}` for Bo3 |
| Ban accepted but wrong action type                  | Clojure ignores ban/pick sequence                                 | Enforce with TS `determineNextAction` before `banMap`            |

## REST API reminders

Docs: https://redplanetlabs.com/docs/~/rest.html

```text
POST /rest/<module>/depot/<depot>/append
Content-Type: text/plain
{"data":{…},"ackLevel":"ack"|"appendAck"|"none"}

POST /rest/<module>/pstate/<$$name>/selectOne
["key","field"]

POST /rest/<module>/pstate/<$$name>/select
["key","remaining"]   ; or navigators like ["all"], ["view","#__fOps.SIZE"]
```

- Implicit navigators: string/keyword → `key`; function → `filterPred`
- Explicit: `["must","a","b"]`, `["sortedMapRangeFrom","k",{"max-amt":20}]`
- Partition override: `[["pkey","x"],"mapKeys"]`
- Special types in requests only: `#__L` long, `#__K` keyword, `#__f` function, …
- Responses are plain JSON (no `#__` tags)
- Reactivity over REST: **not available yet** — poll or bridge later

## Ack return contract (mge.tf)

```clojure
(ack-return> {"ok" true "matchId" *match-id})
(ack-return> {"ok" false "error" "not-your-turn" "expectedTeamId" *expected})
```

TS:

```ts
const acks = await client.append('*match-depot', event, 'ack');
const result = acks['matches']; // topology name — NOT the module name
// DemosModule stream topology is "demos" → acks['demos']
```

## Partitioning cheatsheet

| Depot                                                | hash-by                     | Why                                                  |
| ---------------------------------------------------- | --------------------------- | ---------------------------------------------------- |
| `*match-depot`                                       | `matchId`                   | Score + bans + comms serialize per match             |
| `*user-depot`                                        | `steamId`                   | Ban/sessionVersion serial per user                   |
| `*team-depot`                                        | `teamId`                    | Roster mutations serialize per team                  |
| `*demo-depot`                                        | `reportId` \|\| `demoId`    | Report + resolve share partition; create uses demoId |
| Cross-entity uniqueness (one team per player/season) | hop to steamId partition    | Same pattern as friendship accept                    |
| Status / match indexes                               | `\|hash` status or week key | After primary write on match partition               |

Playoff index hack (no PlayoffsModule yet): store playoff matches with **`weekNo: 0`** → `$$matches-by-week` key `"{seasonId}:0"`.

## TypeScript service cutover

| Pattern                 | Do                                                              | Don't                                |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------ |
| Backend gate            | `isRamaBackend()` then dynamic import of `rama/*`               | Import prisma under Rama             |
| DTO shape               | Synthesize Prisma-like plain objects the UI already expects     | Leak Rama maps into `.svelte`        |
| Missing module          | Soft stub (`getGlobalSettings`, synthetic playoff, empty staff) | Call prisma (hard-error proxy)       |
| Map ban id              | `matchMapBan.id = matchId`                                      | Invent a second numeric id space     |
| Action types in history | Uppercase `BAN`/`PICK` for UI that checks Prisma enums          | Leave lowercase `"ban"` from Clojure |
| E2E seed                | Depot append via `src/lib/server/rama/*` helpers                | Prisma / SQL under Rama E2E          |

## Cluster / deploy

```bash
cd rama && lein uberjar-modules
FORCE_REDEPLOY=1 bash scripts/rama-cluster.sh deploy
# destroy confirm is interactive — script pipes module name:
# printf '%s\n' "$mod" | ./rama destroy "$mod"
```

- New module: add to `project.clj` `:uberjar :aot` **and** `scripts/rama-cluster.sh` `MODULES`
- `FORCE_REDEPLOY` destroys data — god-path E2E reseeds every run
- Check status: `./rama moduleStatus "mge.tf.rama.demos-module/DemosModule"`

## What not to do

- Don't put Prisma in new domain paths once a Rama module owns that domain
- Don't invent a Clojure Ring/HTTP API "for convenience"
- Don't use records for events TypeScript must append
- Don't start the SvelteKit dev server to "verify" Rama — use `lein test-rama`
- Don't nest `<<if` until the compiler cries — flatten early
- Don't assume create/update/resolve share a partition unless `hash-by` says so
- Don't dual-write Postgres + Rama — `DATA_BACKEND=rama` makes prisma a hard error on purpose

## Working example paths

```clojure
;; write field
(local-transform> [(keypath *match-id "status") (termval "PLAYED")] $$matches)

;; append to vector (navigators outside keypath)
(local-transform>
 [(keypath *match-id "actions") AFTER-ELEM
  (termval {"teamId" *team-id "arenaId" *arena-id "actionType" *action-type})]
 $$map-bans)

;; compact multi-field write
(local-transform>
 [(keypath *match-id)
  (multi-path
   [(keypath "turn") (termval *next-turn)]
   [(keypath "banPhaseComplete") (termval *now-complete)])]
 $$map-bans)

;; mirror index on another partition
(|hash *home-id)
(local-transform>
 [(keypath *home-id *match-id) (termval *season-id)]
 $$matches-by-team)

;; status index move (demos resolve)
(|hash *old-status)
(local-transform> [(keypath *old-status *report-id) NONE>] $$reports-by-status)
(|hash *status)
(local-transform> [(keypath *status *report-id) (termval true)] $$reports-by-status)
```

```ts
await client.selectOne('$$matches', [matchId, 'status']);
await client.selectOne('$$map-bans', [matchId, 'turn']);
await client.append(
  '*match-depot',
  {
    type: 'ban-map',
    matchId,
    teamId,
    arenaId,
    actionType: 'ban', // or 'pick' — validated in TS
  },
  'ack',
);

// Demos — resolve must include reportId (partition key)
await client.append(
  '*demo-depot',
  { type: 'resolve-report', reportId, status: 'ACTION', adminComments: '', adminId },
  'ack',
);
```
