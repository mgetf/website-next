# RFC: League Player Experience

**Author:** Maxi + Cursor  
**Date:** September 10, 2026  
**Status:** Draft — iterate before implementing  
**Related:** [`bracket-rendering.md`](bracket-rendering.md) (Phase 7 league mapper, never shipped), [`realtime-notifications.md`](realtime-notifications.md)

This is a working document. Each phase is independently shippable. We implement one phase at a time, then come back here to adjust the next one.

---

## Product goal

A player who is in a league should be able to, without already knowing a match ID:

1. **Learn** that a new match (or bye) exists — the whole roster, not only owners.
2. **Prepare and close** that match — team admin can ban maps and report the result, same as the owner.
3. **See where they stand** on the public standings without hunting for their row.
4. **See the season on `/leagues/[format]`** — past/upcoming matches per division, and a real playoff bracket when playoffs start.

`/matches/[id]` stays the operational hub (schedule, bans, comms, scores, dispute). `/teams/[id]` stays the roster HQ. This RFC does **not** add a “my week” dashboard or automatic scheduling.

---

## Current state (short)

| Surface             | What it does today                                                          | Gap                                                                     |
| ------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `/signup`           | Create/join, pay, ready                                                     | After READY there is no “season mode”                                   |
| `/leagues/[format]` | Standings + Season Info                                                     | No match list, no playoff tree, no self-row                             |
| `/matches/[id]`     | The only place to operate a match                                           | You must already have the ID                                            |
| `/teams/[id]`       | Roster + match history for that team                                        | Not the public league view                                              |
| `/tournaments/[id]` | `BracketRenderer` for cups                                                  | Separate product; unused by leagues                                     |
| Notifications       | `MATCH_CREATED` / `BYE_WEEK` go to `permissionLevel >= 1`                   | Regular members get nothing                                             |
| Match permissions   | `canUserManageMatch` requires owner (`permissionLevel === 2`) or site staff | Team admin cannot report or ban maps                                    |
| Playoff data        | `Playoff` + signed `Match.playoffRound` exist                               | No mapper to `BracketData`; league page never imports `BracketRenderer` |

Permission model (do not change the numbers):

- `0` = member
- `1` = team admin
- `2` = team owner

`isTeamAdmin` in `permissions.ts` is already `1 || 2`. Match scoring and reschedule still require `=== 2`.

---

## Out of scope (deferred)

Do not design these in this RFC. Call them out only so they do not sneak into a phase.

- Automatic in-game match coordination — now its own RFC: [`in-game-match-coordinator.md`](in-game-match-coordinator.md)
- Discord pings for league matches (the coordinator RFC may add a “claimed on server X” ping later)
- “My matches this week” hub in nav or homepage
- Live in-game status on the website (coordinator RFC Phase 6)
- Rendering regular season as round-robin `BracketData`
- Expanding score-submit / dispute `MATCH_COMM` from owners to the full roster (match **comments** already notify the full roster via `createNotificationForMatch`)

---

## Phase map

| Phase | Theme                                       | Size | Depends on                                          |
| ----- | ------------------------------------------- | ---- | --------------------------------------------------- |
| **1** | New match: notify the whole roster          | S    | —                                                   |
| **2** | Prepare: team admin can report and ban maps | S    | —                                                   |
| **3** | Standings: highlight the viewer’s team      | S    | —                                                   |
| **4** | League page: match list per division        | M    | —                                                   |
| **5** | League page: playoff bracket                | M    | `bracket-rendering.md` components (already shipped) |

Phases 1–3 are independent. Phases 4–5 both land on `/leagues/[format]`. If playoff visualization has to jump the queue, swap 4 and 5; the mapper does not need the match list.

---

## Phase 1 — Notify the whole roster

**Goal:** When a week match, playoff match, or bye is created, every **active** roster member on the involved team(s) gets the in-site notification.

### Bug

`createNotificationForTeamOwners` in `src/lib/server/services/notifications.ts` filters `permissionLevel: { gte: 1 }`. Call sites in `adminMatches.ts`:

- `createMatches` → `MATCH_CREATED` (`/matches/{id}`)
- unpaired teams → `BYE_WEEK` (`/teams/{id}`)
- `createPlayoffMatch` → `MATCH_CREATED`

`createNotificationForTeam` already fans out to the full active roster, but it hardcodes type `PENDING_PLAYER` and URL `/teams/{id}`, so it cannot be reused as-is.

### Build

1. Add a generic helper, e.g. `createNotificationForRoster(teamIds, type, url, message, actorSteamId?)`:
   - active players only (`active: 1`)
   - unique Steam IDs
   - skip `actorSteamId` if present
   - no permission filter
2. Point the three `adminMatches` call sites at it. Leave `createNotificationForTeamOwners` for score submit / dispute until we decide otherwise.
3. Keep notification **types** (`MATCH_CREATED`, `BYE_WEEK`). Dropdown already has a `MATCH_CREATED` icon; `BYE_WEEK` currently falls through to the generic bell — add a case in `NotificationDropdown.svelte` (and the full notifications page) so bye weeks are recognizable.

### Tests

- Helper: member (`0`) is included; inactive is not; actor is skipped; two teams do not duplicate a player who somehow sits on both.
- No Prisma in the route. Service-only.

### Done when

A permission-0 player on a 2v2 roster receives `MATCH_CREATED` when staff generate the week, and `BYE_WEEK` when their team is unpaired. Owners/admins still receive the same notifications (no regression).

### Open for iteration

- Include `BYE_WEEK` in this phase? **Recommend yes** — same “week assignment” signal.
- Also fan out score-submitted `MATCH_COMM`? **Recommend no** for this phase.

---

## Phase 2 — Team admin can prepare and report

**Goal:** A team admin (`permissionLevel >= 1`) can do the match-page work that today is owner-only: map bans and score submit. Site staff unchanged. Permission-0 members still cannot.

### Bug

`isTeamOwner` in `src/lib/server/utils/matchScoring.ts` requires `permissionLevel === 2` (except 1v1 sole active member). That gate is `canUserManageMatch`, which the match page uses for bans, scores, and dispute.

A second copy lives in `matchComms.ts` `canRespondToReschedule`: accept/deny is also `permissionLevel === 2` only.

Map-ban **turn** logic already keys off which **team** is up, not which role. The role gate is `canManage` on the page. Fixing `canUserManageMatch` is enough for bans.

The existing test named “allows team owners and admins” means **site** admins, not team admins. There is no passing case for `permissionLevel === 1`.

### Build

1. Treat an active membership with `permissionLevel >= 1` as manager. Keep the 1v1 sole-active-member exception.
2. Keep returning `isHomeOwner` / `isAwayOwner` **or** rename to `isHomeManager` / `isAwayManager` in the same PR if the churn is acceptable. Prefer rename so the flags stop lying; if we keep the names, document the new meaning in the helper comment.
3. Align `canRespondToReschedule` with the same rule. Team admin can accept/deny a reschedule on behalf of their team. Cancel stays requester-or-site-staff.
4. Dispute window stays 24h and still requires `canManage` — team admin can dispute. Do not give permission-0 that power.

### Tests (`matchScoring.test.ts`)

- 2v2 permission `1` → `canManage: true`, home/away flag set for that side.
- 2v2 permission `0` → still denied.
- Inactive membership → still denied.
- 1v1 sole member with stale `0` → still allowed.
- Site admin/mod → unchanged.

Add a small unit case for `canRespondToReschedule` if it is cheap to extract; otherwise cover via the shared helper.

### Done when

A team admin can open `/matches/[id]`, take the map-ban turn, and submit scores. A regular member still cannot. Owner still can.

### Open for iteration

- Reschedule accept/deny in this phase? **Recommend yes** — same “who may speak for the team” surface, not the deferred auto-coordinator.
- Rename the flags? **Recommend yes** if the match page + server actions are the only consumers (they are, plus tests).

---

## Phase 3 — Highlight the viewer’s standings row

**Goal:** On `/leagues/[format]`, the logged-in viewer’s team (or 1v1 entry) gets a **slight** row highlight. Extra detail stays on `/teams/[id]`. Logged-out: no highlight.

### Current UI

`teamRowClass` already paints a 4px inset for READY / PENDING / UNREADY / PLACEMENT / withdrawn. Do **not** add a second inset — it would fight status color.

`data.user` is already on the page. 2v2 rows already include `players[].steamId`. 1v1 rows already include `playerId`.

### Build

1. Compose classes: keep the status inset, add a quiet background for “this is you”, e.g. `bg-primary-500/10` (brand token, not a format color — the row is “you”, not 1v1 vs 2v2).
2. Match:
   - 1v1: `team.playerId === data.user.steamId`
   - 2v2: `team.players.some(p => p.steamId === data.user.steamId)`
3. Apply on division tables **and** the unassigned table.
4. No new columns, no “YOU” badge, no auto-scroll. If we want a tiny `aria-current` later, that is polish.

Svelte: do not seed `$state` from `data.*`. Derive the viewer steam id and the highlight predicate. Validate the page with the Svelte MCP autofixer.

### Done when

Logged in, your row is visibly but quietly distinct. Status color still reads. Someone else’s table is unchanged. Logged out looks as today.

---

## Phase 4 — Match list per division on the league page

**Goal:** Under each division block on `/leagues/[format]` (same season + region already selected), show the matches for that division: week, opponents, status, score, link to `/matches/[id]`.

This is the public schedule/results pane. It is not a second match-ops UI.

### Build

1. **Service** (not `+page.server.ts` Prisma): e.g. `getLeagueMatchesByDivision(seasonId, regionId)` in `matches.ts` or a small `leagueMatches.ts`.
   - One query for the selected season+region.
   - Group by the teams’ `divisionId` (home/away should share a division; if they do not, attach to home and do not duplicate).
   - Regular season: `playoffId == null` (or `weekNo != null`). Playoff rows belong in Phase 5, not this list — or, if we show them here as a compact “also played in playoffs” tail, label them with `formatPlayoffRound` and still link to the match. **Recommend: regular season only in this list; playoffs live in the bracket.**
2. **Shape** returned to the page: serializable `{ id, weekLabel, home, away, status, score, href }[]` per division. Use existing week-label helper (`getMatchWeekLabels`).
3. **UI:** under each division’s standings `DataTable`, a compact list (shared `Card` / `DataTable` / `Badge`, design tokens). Group by week. Row click or name → `/matches/[id]`.
4. **Empty:** “No matches scheduled for this division yet.”
5. **Unassigned teams:** skip a match list, or only show matches if both sides are unassigned. **Recommend skip.**
6. Include **upcoming and played**. “Matches that already happened” is the headline, but hiding scheduled weeks would make the page worse the night staff generate them.

### Tests

- Grouping: week 1 and week 2 order ascending; playoff matches excluded if we chose that.
- Load mapping is a plain shape (no Prisma objects).

### Done when

On `/leagues/2v2?season=&region=`, each division shows standings and, below, that division’s week results/schedule with working match links.

### Open for iteration

- Show byes in the list? **Recommend no** for v1 (they are not matches; the team page already lists them).
- New tab vs under the table? **Recommend under the table** so standings and results stay one scroll. A “Matches” tab would hide standings.

---

## Phase 5 — Playoff visualization on the league page

**Goal:** When the selected season has playoff matches, `/leagues/[format]` renders them with the existing `BracketRenderer`. This is the league half of `bracket-rendering.md` Phase 7.

Urgent because the tree already exists in the database and nowhere in the player UI.

### Data already there

- `Playoff`: per season, `numRounds`, `doubleElim` (`0` = single, `1` = double), `isTournament`
- `Match.playoffId`, signed `playoffRound` (`>0` upper, `<0` lower, `0` used as unlabeled “Playoff” / grand-final-ish)
- Labels: `formatPlayoffRound()` → “Upper Round N” / “Lower Round N”
- Builders: `buildSingleElimBracket` / `buildDoubleElimBracket` in `src/lib/server/utils/bracketBuilders.ts`
- Presentation: `BracketData` in `$lib/types/bracket.ts` already documents a league mapper
- `MatchCard` already follows `match.href`

Admin creates playoff matches **per region/division**. One `Playoff` row is per season, but the matches belong to division teams. Render **one bracket per division that has playoff matches**, not one mashed tree for the whole season.

### Build

1. **Mapper in a service** (`playoffs.ts` or `leagueBrackets.ts`), never in `+page.server.ts`:
   - Load playoff config + matches with `playoffId` for the selected season (and region, via team.region).
   - Map each `Match` → `BracketMatchInput`:
     - `round` = `playoffRound` (sign preserved so the builder can split WINNERS / LOSERS / GF)
     - `section` if we need to be explicit (`WINNERS` / `LOSERS` / `GRAND_FINAL`)
     - sides from home/away team (1v1: one player; 2v2: team label + players)
     - scores from `winnerScore` / `loserScore` (and per-game if cheap)
     - `status` PLAYED → `completed`, else `upcoming`
     - `href` = `/matches/{id}`
     - `orderNum` from match id or an explicit order if we have one
   - `doubleElim === 1` → `buildDoubleElimBracket`, else `buildSingleElimBracket`
   - Return `{ divisionId, divisionName, bracket: BracketData }[]`
2. **League page:** add a **Playoffs** tab next to Standings / Season Info. Show the tab when there is at least one playoff match (or a playoff config **and** matches). Empty playoff config with zero matches: keep the tab hidden.
3. Inside the tab: one `Card` + `BracketRenderer` per division. Title = division name.
4. Do not highlight the viewer’s path in v1 (Phase 3 already covers standings). Hover-path already exists in the bracket components.

### Tests

- Mapper unit tests with a tiny signed-round fixture (upper 1, lower 1, upper 2): format, round grouping, hrefs, 1v1 vs 2v2 side shape.
- `doubleElim: 0` vs `1` picks the right builder.

### Done when

A season that has playoff matches shows a Playoffs tab on `/leagues/[format]`. Clicking a match card opens `/matches/[id]`. Divisions without playoff matches do not render an empty ghost bracket.

### Open for iteration

- Tab vs under each standings division? **Recommend a tab.** A double-elim tree is wide; stuffing it under the table fights the standings layout. The match list (Phase 4) stays under the table.
- Show the tab as soon as staff create the `Playoff` row, before any matches? **Recommend wait for matches** so we never paint an empty renderer.
- Incomplete / non-power-of-2 brackets: render what we have; do not invent BYE placeholders unless the builders already require them.

---

## Implementation rules (every phase)

- Database access only in `src/lib/server/services/`. Routes stay thin and map to serializable shapes.
- League UI: `Card`, `Button`, `Badge`, `DataTable`; semantic tokens; no raw palette classes in the route `.svelte`.
- Svelte 5 runes; `$app/state`; no `$state(data.*)`.
- After code: `bun run format`, `bun run check`, `bun run boundary-check`, `bun run knip`, plus tests for the phase.
- Svelte MCP autofixer on any `.svelte` we touch.
- No auto-commit. No `bun run dev` just to “see if it compiles”.

---

## Suggested implementation order in a given week

If we only have time for one thing: **Phase 1** (players already miss match-created pings).  
If we only have time for the “urgente” visual: **Phase 5** (data exists; the tree is the missing product).  
If we do a small UI pass between backend PRs: **Phase 3**.

Do not combine 4 and 5 in the same PR. The league page is already a large component; two features there at once is a painful review.

---

## Iteration log

| Date       | Change                                                    |
| ---------- | --------------------------------------------------------- |
| 2026-09-10 | First draft: phases 1–5, auto-coordination deferred       |
| 2026-09-11 | Auto-coordination moved to `in-game-match-coordinator.md` |
