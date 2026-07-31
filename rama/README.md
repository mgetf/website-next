# Rama spike (mge.tf)

Pride-first backend cut: **Clojure Rama module only**. TypeScript never talks to a custom Clojure HTTP server — it uses **Rama’s built-in REST API with JSON paths**.

Docs: [Rama REST API](https://redplanetlabs.com/docs/~/rest.html)

## Transit choice

| Option                          | Verdict                                                                |
| ------------------------------- | ---------------------------------------------------------------------- |
| gRPC                            | Rejected — extra schema/codegen surface, not what Rama ships           |
| Custom HTTP/JSON RPC in Clojure | Rejected — duplicates what Supervisors already expose                  |
| **Rama REST + JSON**            | **Chosen** — depot append / PState `select`/`selectOne` / query invoke |

Encoding notes from Rama:

- Request bodies are JSON (`Content-Type: text/plain` in their examples; JSON still).
- Paths are JSON lists of navigators: `["m1", "status"]`, `["m1", "remaining", ["all"]]`.
- Non-JSON types use `#__` tags — e.g. longs as `"#__L2"` (TS helper: `ramaLong()`).
- Clojure module names contain `/` → URL-encode as `%2F`.
- Prefer discovering supervisors via Conductor `308` + `Supervisor-Locations`, then load-balance.

## Layout

```
rama/                          Clojure-only module project (Leiningen)
  src/mge/tf/rama/*.clj        Match / Users / Teams / Payments / Notifications / Seasons
  test/mge/tf/rama/*_test.clj
  project.clj

src/lib/server/rama/           TypeScript REST client (no business HTTP server)
  client.ts                    generic append / select / selectOne / invokeQuery
  match.ts | users.ts | teams.ts | payments.ts | notifications.ts | seasons.ts

scripts/rama-smoke.ts          end-to-end against a live cluster
```

## Modules

| Module                | Depot                 | Owns                                                          |
| --------------------- | --------------------- | ------------------------------------------------------------- |
| `MatchModule`         | `*match-depot`        | create/ban/score + standings mirrors                          |
| `UsersModule`         | `*user-depot`         | profile, ban, permission, sessionVersion, discord link        |
| `TeamsModule`         | `*team-depot`         | create/join/leave, roster cap, season uniqueness              |
| `PaymentsModule`      | `*payment-depot`      | mark-paid, item order create/confirm/expire, team paid counts |
| `NotificationsModule` | `*notification-depot` | notify, mark-read, mark-all-read, unread count                |
| `SeasonsModule`       | `*season-depot`       | create, flags, schedule, info; unique (region, format, num)   |

Agent skill (knots + how to write Rama here): `.cursor/skills/rama-clojure/`

## MatchModule spike (replaces match + map-ban + standings slice of Postgres)

**Depot** `*match-depot` — `hash-by` `matchId`

| `type`         | Fields                                                     |
| -------------- | ---------------------------------------------------------- |
| `create-match` | matchId, homeTeamId, awayTeamId, seasonId, boGames, pool[] |
| `ban-map`      | matchId, teamId, arenaId                                   |
| `submit-score` | matchId, homeScore, awayScore                              |

**PStates**

| PState              | Shape                                                                               |
| ------------------- | ----------------------------------------------------------------------------------- |
| `$$matches`         | `{matchId → {homeTeamId, awayTeamId, seasonId, status, scores, winnerId, boGames}}` |
| `$$map-bans`        | `{matchId → {turn, teams, remaining set, actions list}}`                            |
| `$$team-stats`      | `{teamId → {wins, losses, points}}`                                                 |
| `$$matches-by-team` | `{teamId → {matchId → seasonId}}` (subindexed)                                      |

Stream topology name: `matches` (ack returns land under that key).

### Example REST calls

Module: `mge.tf.rama.match-module/MatchModule`

```bash
# create (ack waits for PState updates)
curl -L -X POST -H 'Content-Type: text/plain' \
  'http://localhost:8888/rest/mge.tf.rama.match-module%2FMatchModule/depot/*match-depot/append' \
  -d '{"data":{"type":"create-match","matchId":"m1","homeTeamId":"home","awayTeamId":"away","seasonId":"s1","boGames":"#__L2","pool":["process","discard","viggle","asa","product"]},"ackLevel":"ack"}'

# read status
curl -L -X POST -H 'Content-Type: text/plain' \
  'http://localhost:8888/rest/mge.tf.rama.match-module%2FMatchModule/pstate/$$matches/selectOne' \
  -d '["m1","status"]'
```

TypeScript:

```ts
import { createMatchClient, createMatch, getMatchStatus } from '$lib/server/rama/match';

const client = createMatchClient({ conductorUrl: process.env.RAMA_CONDUCTOR_URL! });
await createMatch(client, { type: 'create-match', matchId: 'm1' /* … */ });
await getMatchStatus(client, 'm1'); // "UNPLAYED"
```

## Run Clojure tests (InProcessCluster — no real cluster)

```bash
cd rama
lein test-rama
```

## Smoke against a real cluster

```bash
RAMA_CONDUCTOR_URL=http://<conductor>:8888 bun run rama:smoke
```

1. Launch `MatchModule` on your Rama cluster (Conductor UI / CLI).
2. Set `RAMA_CONDUCTOR_URL` (optional `RAMA_SUPERVISOR_URL` to skip discovery).
3. Run the smoke script above.

## PaymentsModule

**Depot** `*payment-depot` — `hash-by` `orderId|steamId`

| `type`               | Fields                                                                          |
| -------------------- | ------------------------------------------------------------------------------- |
| `mark-paid`          | steamId, seasonId, teamId, status (`PAID`/`EXEMPT`), amount, source, paymentId? |
| `create-item-order`  | orderId, steamId, teamId, seasonId, amount                                      |
| `confirm-item-order` | orderId                                                                         |
| `expire-item-order`  | orderId                                                                         |

**PStates:** `$$player-season-payment`, `$$team-paid-count`, `$$item-orders`, `$$payments`  
Topology ack key: `payments`.

## NotificationsModule

**Depot** `*notification-depot` — `hash-by` `steamId`

| `type`          | Fields                                         |
| --------------- | ---------------------------------------------- |
| `notify`        | steamId, id, notifType, body, href?, createdAt |
| `mark-read`     | steamId, id                                    |
| `mark-all-read` | steamId                                        |

**PStates:** `$$notifications`, `$$unread-count`  
Topology ack key: `notifications`.

## SeasonsModule

**Depot** `*season-depot` — `hash-by` `seasonId`

| `type`          | Fields                                                    |
| --------------- | --------------------------------------------------------- |
| `create-season` | seasonId, seasonNum, numWeeks, regionId, formatId         |
| `set-flags`     | seasonId, signupsOpen, rosterLocked, paymentRequired      |
| `set-schedule`  | seasonId, matchWeek, matchDeadline?                       |
| `set-info`      | seasonId, info                                            |
| `update-season` | seasonId, numWeeks (identity keys immutable after create) |

**PStates:** `$$seasons`, `$$season-index` `{regionId → {formatId → {seasonNumStr → seasonId}}}`  
Topology ack key: `seasons`.

## Ripping Postgres out (next steps)

1. ~~Expand modules: users, teams, payments, notifications, seasons~~ (done in this spike).
2. Add events/brackets + map-ban-pool config modules.
3. Point SvelteKit form actions at `RamaClient.append` + `selectOne` instead of Prisma services.
4. Keep Steam/Discord OAuth + R2 blobs at the edge; store only indexes in PStates.
5. Replace `pg_notify` SSE with notification PState polling or a tiny bridge once Rama exposes reactivity over REST.
6. Delete Prisma when every read/write path has a PState/depot equivalent.

This spike proves the hard interactive paths without a second HTTP stack.
