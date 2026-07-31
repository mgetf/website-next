# Rama knots (scar tissue from MatchModule)

Hard failures we hit while spiking `rama/src/mge/tf/rama/match_module.clj`. Read when something weird breaks.

## Compile-time

| Symptom                                          | Cause                                                                | Fix                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------- |
| `Unable to resolve symbol: let* in this context` | Used Clojure `and`/`or`/`if-let`/`when-let` in dataflow              | Use `and>` / `or>` / `<<if`, or move logic to `defn`  |
| `StackOverflowError` in `clojure.algo.monads`    | Deep nested `<<if` / `<<switch` / `<<cond`                           | ≤2 levels of dataflow branching; helpers for the rest |
| `EOF while reading`                              | Unbalanced parens after editing `<<if` trees                         | Count closers carefully; prefer flatter code          |
| Minimal module works, big one doesn't            | Almost always `and` or nesting — bisect by commenting event handlers | Add one `<<if (= *type …)` handler at a time          |

## Runtime / worker death

| Symptom                                              | Cause                                                   | Fix                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Key must be integer` on ban/list update             | `AFTER-ELEM` (or similar) passed **into** `keypath`     | `[(keypath id "actions") AFTER-ELEM (termval row)]`                                   |
| `CallbackException` / connection closed on append    | Topology threw; worker watchdog killed the task         | Check worker ERROR logs above the test failure                                        |
| Duplicate / flaky ack after create                   | `ops/explode` then `ack-return>` on same lineage        | Write whole set with `termval`, or `anchor>`/`<<branch`                               |
| Registration-style races                             | Wrong depot partitioner                                 | `hash-by` the entity whose serializability you need                                   |
| Uniqueness check always passes / never sees existing | `local-select>` on wrong partition (still on depot key) | `\|hash` the index key **before** reading that PState                                 |
| Giant `and>` of many `not=` for unknown-type         | Parser / compile pain                                   | `(defn known-type? [t] (contains? #{…} t))` then `(<<if (not (known-type? *type)) …)` |

## Schema / path

| Symptom                                             | Cause                                                             | Fix                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| REST `selectOne` returns null for a field you wrote | Keyword keys in PState, string navigators in JSON (or vice versa) | String keys end-to-end for REST-first modules          |
| Long fields wrong / type errors                     | JSON number → Integer, schema expects Long                        | `(long v)` in topology; `"#__L…"` from TS              |
| Subindexed set pain for 5–7 items                   | Over-engineering                                                  | Store as `Object` + Clojure set via `termval`          |
| `nil->val` "didn't write"                           | View navigator without term                                       | End with `(term identity)` or `(term inc)` / `termval` |

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
const result = acks['matches']; // topology name
```

## Partitioning cheatsheet

| Depot                                                | hash-by                  | Why                                 |
| ---------------------------------------------------- | ------------------------ | ----------------------------------- |
| `*match-depot`                                       | `matchId`                | Score + bans serialize per match    |
| `*user-depot`                                        | `steamId`                | Ban/sessionVersion serial per user  |
| `*team-depot`                                        | `teamId`                 | Roster mutations serialize per team |
| Cross-entity uniqueness (one team per player/season) | hop to steamId partition | Same pattern as friendship accept   |

## What not to do

- Don't put Prisma in new domain paths once a Rama module owns that domain
- Don't invent a Clojure Ring/HTTP API "for convenience"
- Don't use records for events TypeScript must append
- Don't start the SvelteKit dev server to "verify" Rama — use `lein test-rama`
- Don't nest `<<if` until the compiler cries — flatten early

## Working example paths (MatchModule)

```clojure
;; write field
(local-transform> [(keypath *match-id "status") (termval "PLAYED")] $$matches)

;; append to vector
(local-transform>
 [(keypath *match-id "actions") AFTER-ELEM
  (termval {"teamId" *team-id "arenaId" *arena-id})]
 $$map-bans)

;; mirror index on another partition
(|hash *home-id)
(local-transform>
 [(keypath *home-id *match-id) (termval *season-id)]
 $$matches-by-team)
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
  },
  'ack',
);
```
