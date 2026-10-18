# Public league read API

**Date:** October 14, 2026
**Status:** First read slice is implemented. Docs page, events, and writes are not.
**Audience:** Future agents and contributors extending `/api/v1`.

This file is the record of the design settled for a general public league API. Read it before adding a route, a query param, or an auth check under the resources listed below. Do not re-derive the shape from the website pages or from a plugin's needs.

## What this API is

External sites, a Discord bot, and later a TF2 plugin should consume the same league resources. The API is topic-oriented: formats, regions, seasons, divisions, teams, matches, players, standings, placements.

It is not a backend-for-frontend for the arena-lock plugin. A route such as `pending-opponents` was considered and rejected. The plugin asks the league what matches exist, then decides locally whether the other player in the arena is on the opposing side. The API does not know who is standing in a live arena.

League `Match` rows and event `EventMatch` rows stay separate resources. Events are the next slice, not part of this one.

The website keeps calling services in-process. It must not call its own HTTP API.

## Locked decisions

- JSON lives at `https://mge.tf/api/v1/...`. Do not serve HTML under `/api`.
- A human docs page (Scalar, or similar, plus `openapi.json`) belongs at something like `/developers`, in the same app. `api.mge.tf` can later alias the same service. That page was explicitly deferred. Do not build it unless asked.
- These league reads are anonymous. Do not put `requireApiKey` or `requireRateLimitedApiKey` back on them. The data is already on the public website. A key inside a SourceMod plugin would be public the moment the plugin ships.
- Payments, Discord links, staff roles, log upload, item refunds, and reschedule jobs stay behind a Bearer `mge_` key. `GET /api/v1/users/:steamId` stays the bot identity route and still includes Discord.
- `GET /api/v1/players/:steamId` is the league player. It must not include Discord, `permissionLevel`, or payments.
- Format in query strings is the public code (`1v1`, `2v2`), not a numeric id. Stored codes are matched case-sensitively. An unknown code is `400 Unknown format`, not `404`.
- `current=true` means the season is referenced by `ActiveSignupSeason` and its region is not hidden.
- Query names are `regionId`, `seasonId`, `divisionId`, `teamId`, plus `format`, `current`, `status`, `player`, `week`, `page`.
- `player` and the player path are a 17-digit Steam64. `STEAM_0:Y:Z` is `400`.
- Status values are lowercase on the wire (`ready`, `unplayed`). Rank and filter standings with the Prisma enum (`READY`) before lowercasing the JSON. `isRankedStandingsTeam` compares against `'READY'`.
- 1v1 is a team of one. The public team list and the player payload include individual formats. Do not reuse `getTeamsPublic` or `getPlayerTeams` for this API: those hide 1v1.
- Match `winnerScore` / `loserScore` are relative to the winner, not home/away. Map them with `scoresForLeagueMatch`.
- Hidden regions (`hidden !== 0`) and hidden divisions do not appear. A season in a hidden region is `404`. A `divisionId` outside that season's region and format is `404 Division not found`. An unknown `regionId` on a list filter returns an empty page, not `404`.
- Missing season, team, match, player, or division is `404` with `{ "error": "..." }`. A bad query is `400` with the same shape. Do not throw `notFound()` / `badRequest()` from this service: those emit SvelteKit's `{ message }` body.
- Never return join passwords, `paymentStatus`, signup cost, currency, Discord ids, match comms, demos, map bans, or admin drafts.
- Staging (`dev.mge.tf`) still hard-blocks `/api/*` for non-staff in `hooks.server.ts` with JSON `403`. That gate is separate from the API key.

## What is built

Twelve anonymous `GET`s. Lists that can grow are paged at 50. Formats, regions, divisions, standings, and placements return the whole collection in one page object.

| Method | Path                                                                        |
| ------ | --------------------------------------------------------------------------- |
| GET    | `/api/v1/formats`                                                           |
| GET    | `/api/v1/regions`                                                           |
| GET    | `/api/v1/seasons?regionId=&format=&current=true\|false&page=`               |
| GET    | `/api/v1/seasons/:id`                                                       |
| GET    | `/api/v1/seasons/:id/divisions`                                             |
| GET    | `/api/v1/seasons/:id/standings?divisionId=`                                 |
| GET    | `/api/v1/seasons/:id/placements?divisionId=`                                |
| GET    | `/api/v1/teams?seasonId=&divisionId=&status=&page=`                         |
| GET    | `/api/v1/teams/:id`                                                         |
| GET    | `/api/v1/matches?player=&status=&seasonId=&teamId=&week=&divisionId=&page=` |
| GET    | `/api/v1/matches/:id`                                                       |
| GET    | `/api/v1/players/:steamId`                                                  |

Team `status`: `dead`, `unready`, `pending`, `ready`, `placement`. Match `status`: `unplayed`, `played`, `dispute`. Anything else is `400`. Empty query values are treated as absent. `page` is `1..10000`.

### Envelope

Paged and full collections:

```json
{ "data": [], "page": { "page": 1, "perPage": 50, "total": 0, "totalPages": 0 } }
```

A single resource is the object itself, not wrapped in `{ success, data }`. That wrapper is the generic rule for other API routes. These reads do not use it.

Errors:

```json
{ "error": "Season not found" }
```

### Shapes

Season: `id`, `number` (`seasonNum`), `weeks`, `matchWeek`, `signupsOpen`, `rosterLocked`, `matchDeadline` (ISO or null), `region` `{ id, name }`, `format` `{ id, code, name }`. `region.hidden` is used internally and must not appear in JSON.

Team card: `id`, `name`, `acronym`, `avatar`, `status`, `wins`, `losses`, `format`, `region` or null, `division` or null, `season` `{ id, number }` or null. Detail adds `gamesWon`, `gamesLost`, `pointsScored`, `pointsScoredAgainst`, and `players`. List order is `id` ascending so pages stay stable. Standings are the ranked view.

Match list: `id`, `status`, `week`, `playoffRound` (null unless `playoffId` is set), `scheduledAt`, `timezone`, `season` `{ id, number, region, format }`, `division` from the home team, `home` and `away` `{ id, name, players }`, `score` `{ home, away }` or null, `winnerId`. Detail adds `boSeries`, `boGames`, and `games` `{ number, homeScore, awayScore, arena }`. Default order is `weekNo` ascending, then `id`. `teamId`, `player`, and `divisionId` are AND-ed so one filter does not replace another. A player filter matches an active roster (`active: 1`) on either side.

Player: `steamId`, `name`, `avatar`, `banStatus` (lowercase), `teams` (team card plus `active`). Teams in a hidden region are omitted. `404` if there is no `User` row. This route does not call the Steam API.

Standings follow the public league page: `getGlobalSettings().standingsVisibleStatuses` (default `READY`, `PENDING`), `listsLivingSignups`, `shouldShowOnLeagueDivision`, `compareStandingsTeams`, `withStandingsRanks`. Only `READY` rows receive a rank. `points` is average points scored per game, one decimal, same as the site. Name is the final tiebreak. Omitting `divisionId` appends an unplaced group with `division: null` and no ranks. One query per division is acceptable; the league page does the same.

Placements: `place`, `division` `{ id, name }`, `team` `{ id, name }`, `players`. Ordered by division, then place.

### Plugin read

Pending league matches for a Steam64:

```http
GET /api/v1/matches?player={steam64}&status=unplayed
```

Pass `seasonId` for the current season when the caller already knows it (`GET /api/v1/seasons?current=true&format=1v1&regionId=`). The other side's `players` are the rival Steam64s. 2v2 returns both. The plugin checks those ids against the arena locally.

### Rate limit

One policy, `PUBLIC_READ_POLICY` / `publicReadRateLimiter` in `src/lib/server/utils/rateLimit.ts`: 100 requests per 60 seconds per client address, fixed window, in memory, per Node process. Two replicas means about twice that in practice. `publicGet` applies it to every league read, including `400` and `404`. A new league read must go through `publicGet` so it joins the same quota.

Headers on every response (IETF RateLimit fields):

```http
RateLimit-Policy: "public-read";q=100;w=60
RateLimit: "public-read";r=99;t=60
```

`429` also sends `Retry-After` and `{ "error": "Too many requests. Please try again later." }`.

The address is SvelteKit `getClientAddress()`. The production image sets `ADDRESS_HEADER=CF-Connecting-IP`. Do not key this quota on a raw `X-Forwarded-For` header: the client can spoof it. If the address cannot be read, the request shares the `unknown` bucket.

An optional key that raises the quota was discussed and skipped. Add it only when a caller asks.

### Code map

| File                                                                 | Role                                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/routes/api/v1/{formats,regions,seasons,teams,matches,players}/` | Thin `GET`s. Parse the path and query, call the service.                           |
| `src/lib/server/api/publicGet.ts`                                    | Quota, then JSON. Maps `PublicQueryError` to 400 and `PublicNotFoundError` to 404. |
| `src/lib/server/api/publicLeagueQuery.ts`                            | Hand-rolled query parsers and those two error classes.                             |
| `src/lib/server/services/publicLeague.ts`                            | All Prisma for this slice. Plain objects out.                                      |
| `src/lib/server/utils/rateLimit.ts`                                  | `PUBLIC_READ_POLICY`, `publicReadRateLimiter`, `enforceRateLimit`.                 |
| `tools/mcp/`                                                         | Local stdio MCP. Hand-rolled JSON-RPC in `mcp.ts`. Public reads send no key.       |

`publicGet` and `publicLeagueQuery` are new. They are not copied from an existing helper. Existing v1 reads (the users route) inline the key check and `Response.json({ error })`. Form actions validate with Zod and `validateForm()`, which reads `FormData`, not `URLSearchParams`. Page filters read `searchParams.get` inline. The parsers here exist so twelve routes do not repeat that. A future agent may move them onto Zod if a shared GET schema helper appears. Do not do that as a drive-by rewrite.

Tests: `publicLeagueQuery.test.ts`, `publicGet.test.ts`, and `enforceRateLimit` in `rateLimit.test.ts`. The MCP client is covered by `tools/mcp/api.test.ts` and `tools/mcp/mcp.test.ts`.

### Local MCP

`tools/mcp` is a stdio MCP server that calls this HTTP API. The dispatcher is hand-rolled JSON-RPC in `mcp.ts`: `initialize`, `ping`, `tools/list`, `tools/call`, and a no-body ack for `notifications/*`. There is no MCP SDK. Cursor launches it from `.cursor/mcp.json` as `mge-league`. `MGE_API_BASE` is the origin, default `https://mge.tf`. `http://127.0.0.1:5173` talks to a local dev server. `dev.mge.tf` still returns 403 for non-staff, and the tool result says so.

The server sends no cookie and no `Authorization` header. It refuses a base URL that contains credentials, a path, or a non-http scheme, and it refuses any request path outside `/api/v1/`. Agents with this server enabled should use it for league reads instead of scripts against the production database. The process does not read the app `.env` or `.env.production`. Set `MGE_API_BASE` in `.cursor/mcp.json` `env`, which is already how Cursor starts the process.

`bun run mcp:league` starts the same process. stdout is the protocol stream. Logs go to stderr.

## Not built

Do not start these unless asked. The order below is the one already agreed, not a backlog to chew through.

1. **Docs page.** `/developers` (name not final) with Scalar and `openapi.json` at something like `/openapi.json`. Same app. No HTML at `/api`. The OpenAPI document should describe this slice, not a plugin-specific API.
2. **Events.** `Event` / `EventMatch` as their own resources. Do not fold them into `/matches`.
3. **Writes and staff actions.** The long-term plan is one domain service per operation, called in-process by form actions and by HTTP. A staff-acting API would carry an actor (the audit discussed `X-Actor-Discord-Id`). Service keys stay scoped. There is no capability catalog or CI parity gate yet. Do not expose admin mutations by wrapping Prisma a second time.
4. **Optional keyed quota.** Anonymous 100/min stays the default. A Bearer key may later raise the limit for a known caller. It must not become required for these reads.
5. **A shared quota store.** The limiter is per process, like every other limiter in `rateLimit.ts`. Move this policy to a shared store only if replica fan-out becomes a real problem.
6. **Cache headers and CORS.** Public reads are cacheable. Browser clients on other origins need CORS. Neither is set. Add them when a real consumer needs them.

## How to extend a read

1. Add the filter to `publicLeagueQuery.ts` and its test. Bad input throws `PublicQueryError`.
2. Teach `publicLeague.ts` the query. Missing public resources throw `PublicNotFoundError`. Keep standings comparisons on the uppercase enum.
3. Call it from a thin `+server.ts` via `publicGet(getClientAddress, ...)`.
4. Leave join passwords, payments, Discord, and drafts out of the select.
5. Update this file's route table in the same change.
6. Add the matching read-only tool in `tools/mcp/mcp.ts`: one entry in `TOOLS` and one arm in `callTool`. The MCP server is a client of this HTTP API. It must not import Prisma or `#lib/server`.

## How to add a keyed method

Public reads stay anonymous. A route that returns Discord, payments, or staff data, or that changes anything, uses the existing Bearer `mge_` key via `requireRateLimitedApiKey`. Keys are not scoped yet: any active key can call any keyed route. Do not register an MCP tool for a route just because the route exists. Payments, refunds, Discord roles, and log upload stay off the agent until a scoped key can name them.

1. Implement the operation in a service. The form action and the HTTP route both call that service. Do not add a second Prisma path for the MCP.
2. Put the route under `/api/v1`. Call `requireRateLimitedApiKey` before any work. Missing resources and bad input use `{ "error": "..." }`. A rejected key still comes back as SvelteKit's `{ "message" }`. The MCP client accepts either field.
3. Add the tool in `tools/mcp/mcp.ts` (`TOOLS` plus a `callTool` arm). The path is fixed in that arm. Tool arguments must not include a URL, an API key, a cookie, or a database URL.
4. Public tools never send `Authorization`. A keyed tool sends the Bearer key from `MGE_API_KEY` in the MCP process environment. Do not read the app `.env` or `.env.production`. Do not commit the key and do not put it in `.cursor/mcp.json`.
5. When the route changes data, update the `initialize` instructions in `mcp.ts` so they no longer say the server cannot change that data.
6. Update this file's route table in the same change.

Add a scope catalog before giving an agent a key that can also call payments, refunds, or Discord role routes. Empty scopes on existing keys would stay unrestricted so current bots keep working. A key created for the agent would list only the capabilities its tools use. That catalog is not built.
