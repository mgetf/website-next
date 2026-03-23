# RFC: Unified Tournament Schema

**Author:** Development Team  
**Date:** February 15, 2026  
**Updated:** March 23, 2026  
**Status:** ✅ Completed  
**Completed:** March 2026 (Phase 4b). 16 events, 446 matches, 898 match players, 458 games migrated. Legacy tables dropped.  
**Depends on:** [`docs/proposals/bracket-rendering.md`](bracket-rendering.md) ✅

---

## Summary

MGE.tf has three types of competitive events under the "Tournaments" umbrella — **Cups**, **World Championships**, and **Fight Nights** — each stored in completely separate table hierarchies with no shared structure. This leads to duplicated match/game schemas, inconsistent data quality, inability to represent 2v2 fight nights, and a fragmented codebase that queries three different table trees to display what is conceptually one listing.

This proposal replaces the three siloed hierarchies with a single unified event model that shares match, game, player, and placement structures, while preserving the ability to differentiate between event types for display and workflow purposes.

This is also a prerequisite for the planned **in-house bracket rendering system**, which needs a single, consistent match structure to render against.

**Important context:** All tournament data in the database is historical — there are no active or ongoing tournaments of any type. The actual bracket data for most events lives on external services (BracketHQ, Challonge), not in our database. Cups have only a bracket link and placement columns; the championship has internally-tracked matches but was also managed externally. The migration must bring this external data in-house so we own it fully and can render brackets natively.

**Dependency:** This proposal cannot be executed in isolation. The bracket rendering UI components and services must be designed first (see [`bracket-rendering.md`](bracket-rendering.md)). The schema defined here is the data contract that the bracket renderer consumes — building the renderer first ensures the schema is validated against real rendering needs before data is migrated into it.

---

## Current State: Three Isolated Silos

### 1. Cups — `tournaments` (flat record, no match data)

```prisma
model Tournament {
  id                  Int       @id @default(autoincrement())
  name                String
  description         String?
  bracketLink         String?   // external Challonge link
  avatar              String?
  startedAt           DateTime?
  isTeamTournament    Boolean   @default(false)
  winner1SteamId      String?   // ┐
  winner2SteamId      String?   // │ 6 hardcoded placement columns
  secondPlace1SteamId String?   // │ (2 per placement for 2v2 support)
  secondPlace2SteamId String?   // │
  thirdPlace1SteamId  String?   // │
  thirdPlace2SteamId  String?   // ┘
  demos               Demo[]
}
```

No match records whatsoever. Results are an external bracket link and 6 hardcoded steam ID columns for 1st/2nd/3rd.

**14 cups in the database** (IDs 1–11, 13–15; ID 12 was deleted). ID 15 ("1v1 EU Championship", April 2026) has no results yet — a placeholder for a future event.

### 2. World Championships — `championship` + 3 sub-tables (fully structured)

```prisma
model Championship {
  id, name, avatar, startedAt, endedAt
  status: REGISTRATION | IN_PROGRESS | COMPLETED
  winner (steamId)
  → ChampionshipParticipant[] (registration, seeding, elimination tracking)
  → ChampionshipMatch[] (player1 vs player2, scores, boSeries, status)
    → ChampionshipGame[] (per-game scores, arena, game number)
}
```

The most complete model. Full lifecycle with registration, seeding, match tracking, and per-game detail. But 1v1 only — `player1Id`/`player2Id` are single steam IDs.

**1 championship in the database** — the "2025" World Championship (historical, completed). Contains 71 participants, 166 matches (146 played), and 498 individual games. The `status` column still reads `REGISTRATION` despite the event being over — a stale value never updated. See [Data Quality Issues](#data-quality-issues) for details.

### 3. Fight Nights — `fight_night` + `fight_night_matchups` (broken hybrid)

```prisma
model FightNight {
  id, card (image path — no name!), description, prizepool, startedAt
  → FightNightMatchup[] (player1 vs player2, scores, order)
    → Game[] (shared table with league matches)
    → Demo[]
}
```

No `name` field (the `card` image path renders as the event title in the UI). Matchups are 1v1 only, which made it impossible to store Fight Night II's 2v2 matchups. The `Game` model is shared with the league system via dual foreign keys (`matchId` and `fightNightMatchupsId`).

**2 fight nights in the database** (Fight Night II has zero matchups — its 2v2 data was never entered because the schema couldn't represent it).

---

## Problems with the Current Design

### Structural Fragmentation

| Concern                                        | What Happens Today                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Display a unified event timeline               | Query 3 tables, manually merge and sort results                                           |
| Show a player's tournament history             | Query `tournaments` placements + `championship_match` + `fight_night_matchups` separately |
| Add a new feature (VODs, map veto, scheduling) | Implement it in 3 separate table structures                                               |
| Build a bracket renderer                       | Write adapters for 3 different match schemas, or pick one and ignore the others           |

### Inconsistent Data Model

| Feature              | Cups                          | Championships              | Fight Nights                                  |
| -------------------- | ----------------------------- | -------------------------- | --------------------------------------------- |
| Has name             | Yes                           | Yes                        | **No**                                        |
| Has avatar/image     | `avatar`                      | `avatar`                   | `card` (different field, different semantics) |
| Has status lifecycle | No                            | Yes (enum)                 | No                                            |
| Has prizepool        | No                            | No                         | Yes (always 0)                                |
| Tracks matches       | No                            | Yes (`championship_match`) | Yes (`fight_night_matchups`)                  |
| Tracks games         | No                            | Yes (`championship_game`)  | Yes (shared `games` table)                    |
| Supports 2v2         | Dual steam ID columns         | No                         | No                                            |
| Winner tracking      | 6 hardcoded placement columns | Single winner FK           | Per-matchup winner FK                         |

### 2v2 Format Is Broken

Cups handle 2v2 by doubling the placement columns (winner1 + winner2 for a pair). Championships and fight nights have `player1`/`player2` columns that can only hold one steam ID each. Fight Night II was a 2v2 event and its matchup data was never entered because the schema had no way to represent it.

### Game Table Dual-Purpose

The `games` table serves both league matches and fight night matchups via nullable foreign keys:

```prisma
model Game {
  matchId              Int?  // league match
  fightNightMatchupsId Int?  // fight night matchup
  // ...
}
```

Meanwhile, championships have their own separate `championship_game` table. Three different storage paths for the same concept.

### Cross-Table Duplication

Tournament #14 ("1v1 World Championship 2025", started July 27 2025, has winners) and Championship #1 ("2025", started June 5 2025, 71 participants, 166 matches) represent **the same real-world event** stored in two different tables. The championship side tracks registration and bracket progression; the tournament side stores the final placements and external bracket link. The codebase already works around this — `getRecentTournamentActivity()` in `tournaments.ts` has an explicit comment: _"TEMPORARY WORKAROUND: Exclude championships to avoid duplicates with tournaments table"_.

The migration must merge these two records into a single `Event` row, combining:

- Participant/match/game data from `championship`
- Placement data (winners) from `tournaments`
- The external bracket link from `tournaments`

### `demos` Table Has Three FK Paths

The `demos` table serves all three systems via nullable foreign keys:

```prisma
model Demo {
  matchId       Int?   // league match
  tournamentId  Int?   // cup
  fightNightId  Int?   // fight night
}
```

Currently all 2,453 demos are linked to league matches (0 to cups, 0 to fight nights), but the FK columns exist and must be migrated to point at the unified `events` table.

### Data Quality Issues

A database audit (March 2026) revealed several issues the migration script must handle:

**Phantom/bye users in championship data.** Championship matches reference steam IDs `'1'`, `'2'`, `'3'`, `'4'`:

| steam_id | username             | Purpose                                    |
| -------- | -------------------- | ------------------------------------------ |
| `1`      | hallu                | Real player entered with non-standard ID   |
| `2`      | Higher               | Real player entered with non-standard ID   |
| `3`      | BYE                  | Bye placeholder — opponent gets free win   |
| `4`      | TBD / BYE (low seed) | Bye placeholder for low-seed bracket slots |

Decision needed: strip bye entries during migration (they'll show as empty slots in the bracket), or preserve them as-is in `event_match_players`.

**Score column naming is misleading.** In `championship_match`, the columns `winner_score` and `loser_score` do NOT store the winner's and loser's scores. There are 43 rows where `winner_score < loser_score`. The columns actually store **player1's score and player2's score** respectively. Example:

| match | player1 | player2 | winner | winner_score | loser_score |
| ----- | ------- | ------- | ------ | ------------ | ----------- |
| 16    | P1      | P2      | P2     | 0            | 2           |
| 18    | P1      | '1'     | '1'    | 1            | 2           |

Reading: P1 scored 0, P2 scored 2, P2 won. The migration must map `winner_score → side1Score` and `loser_score → side2Score` (NOT to winner's/loser's scores).

**No round number in championship matches.** The proposed `EventMatch.round` field has no source data in `championship_match`. With 166 matches forming a bracket, the migration must reconstruct round numbers from the match progression order. Strategy: infer rounds from the created_at timestamps and match count per round (64→32→16→8→4→2→1), or accept `round = NULL` for migrated data and populate manually.

**Fight Night Bo3 anomaly.** Fight Night I, matchup #1 (the main event, order 4): `bo_series = 3` but `winner_score = 3, loser_score = 1`. A Bo3 caps at 2-1. This was likely a Bo5 with an un-updated `boSeries` column. Verify and correct during backfill.

**Empty string vs NULL in placement columns.** 4 tournament rows have `third_place1_steam_id = ''` (empty string) and 1 has `NULL`. Both must be treated as "no placement" during migration — neither should produce an `event_placements` row.

**Championship status is stale.** Championship #1 has `status = 'REGISTRATION'` despite having 146 played matches. The migration should set the unified Event status based on actual match data, not the stale column value.

**Placeholder user in Fight Night I.** Matchup #2 references `76561198040409232` ("Not logged in") — a placeholder user who needs to be resolved or flagged.

---

## Proposed Schema: Unified Event Model

### Core Tables

```prisma
enum EventType {
  CUP
  CHAMPIONSHIP
  FIGHT_NIGHT
}

enum EventStatus {
  UPCOMING
  REGISTRATION
  IN_PROGRESS
  COMPLETED
}

enum BracketFormat {
  SINGLE_ELIM
  DOUBLE_ELIM
  ROUND_ROBIN
  CARD            // flat matchup list (fight nights)
}

model Event {
  id            Int            @id @default(autoincrement())
  name          String
  type          EventType
  status        EventStatus    @default(UPCOMING)
  isTeamEvent   Boolean        @default(false) @map("is_team_event")
  description   String?
  avatar        String?
  startedAt     DateTime?
  endedAt       DateTime?
  createdAt     DateTime       @default(now()) @map("created_at")
  prizepool     Decimal        @default(0) @db.Decimal(10, 2)

  // Type-specific (nullable)
  bracketLink   String?        // legacy external bracket URL (cups)
  card          String?        // fight card image URL (fight nights)

  stages        EventStage[]
  participants  EventParticipant[]
  placements    EventPlacement[]
  demos         Demo[]

  @@map("events")
}
```

Every event has a name, type, status, and optional prizepool. `isTeamEvent` maps from the old `isTeamTournament` column and allows efficient queries like "all 2v2 events" without joining through match players. `createdAt` provides an audit trail. `prizepool` uses `Decimal` to avoid floating-point precision issues with currency. Type-specific fields like `bracketLink` and `card` are nullable columns — only a few of them, far less waste than maintaining 3 entire table hierarchies.

Note that `bracketFormat` is **not** on the `Event` model — it lives on `EventStage`, because a single event can have multiple stages with different formats (see below).

### Stages (Multi-Stage Support)

```prisma
model EventStage {
  id            Int           @id @default(autoincrement())
  eventId       Int           @map("event_id")
  name          String
  bracketFormat BracketFormat @map("bracket_format")
  orderNum      Int           @map("order_num")

  event   Event        @relation(fields: [eventId], references: [id])
  matches EventMatch[]

  @@index([eventId, orderNum])
  @@map("event_stages")
}
```

The `EventStage` model sits between `Event` and `EventMatch` to support multi-stage events. Each stage has its own `bracketFormat`, which maps 1:1 to a `BracketData` object for the bracket renderer.

**Why this is necessary:** The 2025 World Championship has 4 distinct stages — Group A (round-robin), Group B (round-robin), Day 2 Play-in (single elim), and Top 8 Bracket (double elim). A single `bracketFormat` on `Event` can't represent this. The stage model cleanly separates them while keeping all stages under one event for listing and navigation purposes.

**Simple events get 1 stage.** Cups have a single stage (e.g., "Main Bracket" with `SINGLE_ELIM`). Fight nights have a single stage ("Card" with `CARD`). No extra complexity for simple events — just one mandatory stage per event.

**World Championship stages:**
| Stage | Name | Format | Order |
| --- | --- | --- | --- |
| 1 | Group A | ROUND_ROBIN | 1 |
| 2 | Group B | ROUND_ROBIN | 2 |
| 3 | Day 2 Play-in | SINGLE_ELIM | 3 |
| 4 | Top 8 Bracket | DOUBLE_ELIM | 4 |

Each stage is rendered independently by the bracket system. The event detail page shows all stages in `orderNum` order.

### Matches

```prisma
model EventMatch {
  id          Int          @id @default(autoincrement())
  stageId     Int          @map("stage_id")
  round       Int?         // bracket round (null for flat/card formats)
  orderNum    Int          @map("order_num")
  label       String?      // "Main Event", "Quarterfinal 1", etc.
  winnerSide  Int?         @map("winner_side") // 1 or 2 (null if unplayed)
  side1Score  Int?         @map("side1_score")
  side2Score  Int?         @map("side2_score")
  boSeries    Int          @default(3) @map("bo_series")
  status      MatchStatus  @default(UNPLAYED)

  stage       EventStage         @relation(fields: [stageId], references: [id])
  players     EventMatchPlayer[]
  games       EventGame[]

  @@index([stageId, round, orderNum])
  @@map("event_matches")
}
```

Matches belong to a **stage**, not directly to an event. To get all matches for an event, join through `EventStage`. Prisma makes this trivial: `event.stages.flatMap(s => s.matches)`.

Winner is stored as `winnerSide` (1 or 2) rather than a steam ID. This avoids ambiguity in 2v2 where there are two winners.

### Match Players (Flexible Team Sizes)

```prisma
model EventMatchPlayer {
  id       Int    @id @default(autoincrement())
  matchId  Int
  steamId  String
  side     Int    // 1 or 2

  match    EventMatch @relation(fields: [matchId], references: [id])
  user     User       @relation(fields: [steamId], references: [steamId])

  @@unique([matchId, steamId])
  @@map("event_match_players")
}
```

This is the key table that eliminates the 1v1-only limitation. Instead of hardcoded `player1SteamId`/`player2SteamId` columns:

- **1v1 match**: 2 rows (one per side)
- **2v2 match**: 4 rows (two per side)
- **Any format**: N rows per side — no schema change ever needed

Example — Fight Night II, "Ryan/Fancy vs Ex/ITY3":

| match_id | steam_id | side |
| -------- | -------- | ---- |
| 42       | ryan_id  | 1    |
| 42       | fancy_id | 1    |
| 42       | ex_id    | 2    |
| 42       | ity3_id  | 2    |

### Games

```prisma
model EventGame {
  id         Int       @id @default(autoincrement())
  matchId    Int
  gameNumber Int
  side1Score Int?
  side2Score Int?
  arenaId    Int?
  playedAt   DateTime?

  match      EventMatch @relation(fields: [matchId], references: [id])
  arena      Arena?     @relation(fields: [arenaId], references: [id])

  @@map("event_games")
}
```

One game table for all event types. Replaces `championship_game`, the fight-night rows in `games`, and will serve cups once in-house brackets are built.

The league `games` table remains separate for league matches — a cleaner separation than today's dual-FK approach.

### Participants (Championship Extension)

```prisma
model EventParticipant {
  id         Int      @id @default(autoincrement())
  eventId    Int
  steamId    String
  seed       Int?
  eliminated Boolean  @default(false)
  hidden     Boolean  @default(false)
  createdAt  DateTime @default(now())

  event      Event @relation(fields: [eventId], references: [id])
  user       User  @relation(fields: [steamId], references: [steamId])

  @@map("event_participants")
}
```

Only populated for events that have a registration phase (championships). Empty for cups and fight nights — no wasted space, no special cases.

### Placements (Write-Time Podium Cache)

```prisma
model EventPlacement {
  id        Int    @id @default(autoincrement())
  eventId   Int
  steamId   String
  placement Int    // 1 = 1st, 2 = 2nd, 3 = 3rd

  event     Event @relation(fields: [eventId], references: [id])
  user      User  @relation(fields: [steamId], references: [steamId])

  @@unique([eventId, steamId])
  @@map("event_placements")
}
```

Placements are **derived from match results and written once when the event concludes**. When the final match result is submitted, the backend automatically computes and inserts placement rows:

- Final match winner → placement 1
- Final match loser → placement 2
- Semifinal losers → placement 3

For 2v2 events, a single placement (e.g. 1st place) will have 2 rows — one per player.

For fight nights (flat matchup cards), placements may not apply — each matchup has its own independent winner stored via `winnerSide` on the match row.

**Why not just derive placements at read time?** Because the tournaments listing page, player profiles, and homepage all need to display "who won Cup X" at a glance. Walking the bracket tree on every page load is unnecessary overhead. Placements are computed once at write time and read cheaply forever.

**Legacy data:** The 14 existing cups have placement data but no match records. Their `winner1SteamId`, `secondPlace1SteamId`, etc. columns map directly into `EventPlacement` rows (skipping empty strings and NULLs). They work identically to future events — same query, same display component, no special cases. They just won't have a viewable bracket until match data is backfilled (if ever).

---

## Table Reduction

| Before                                            | After                          |
| ------------------------------------------------- | ------------------------------ |
| `tournaments`                                     | `events` (unified)             |
| `championship`                                    |                                |
| `fight_night`                                     |                                |
| _(no stage concept)_                              | `event_stages` (new)           |
| `championship_match`                              | `event_matches` (unified)      |
| `fight_night_matchups`                            |                                |
| `championship_game`                               | `event_games` (unified)        |
| fight night rows in `games`                       |                                |
| `championship_participant`                        | `event_participants` (unified) |
| 6 hardcoded placement columns                     | `event_placements` (unified)   |
| `demos.tournament_id` + `demos.fight_night_id` FK | `demos.event_id` FK            |
| **7 tables + shared `games`/`demos` columns**     | **6 tables + clean demo FK**   |

The `event_stages` table is net-new — there was no stage concept before. It adds one table but enables multi-stage events (like the World Championship with 4 distinct bracket formats) without any schema hacks.

---

## External Bracket Data Import

The most valuable data for this migration does not live in our database — it lives on **BracketHQ** and **Challonge**. Every cup in the `tournaments` table has a `bracketLink` pointing to one of these services. The championship was also managed via an external bracket tool. These external services hold the full match trees, round structures, seedings, and per-match results that our database never stored.

### Why This Matters

Without importing external bracket data, the unified schema will have:

- **Cups**: event metadata + placements, but zero match records. Brackets cannot render.
- **Championship**: internally-tracked matches, but no `round` numbers. Bracket structure is unknown.
- **Fight Nights**: 4 matchups from FN I only. FN II has nothing.

Importing from the external services gives us complete bracket trees with proper round numbers, seedings, and match results — solving the round reconstruction problem entirely and making every historical event renderable in-house.

### Import Strategy

This will be a **one-time historical import**. Once data lives inside mge.tf, reliance on external bracket providers ends. The import method (manual entry, API scraping, or a combination) will be determined during implementation, but the result is the same: every historical bracket's match data populates `event_matches`, `event_match_players`, and `event_games`.

### What Each External Source Provides

| Source          | Events                       | Data available                                        |
| --------------- | ---------------------------- | ----------------------------------------------------- |
| BracketHQ       | 8 cups (IDs 1–5, 11, 13, 14) | Bracket tree, match results, round structure, seeding |
| Challonge       | 5 cups (IDs 6–10)            | Bracket tree, match results, round structure, seeding |
| Internal DB     | Championship #1              | Matches + games (but no round numbers)                |
| Discord records | Fight Night II               | 2v2 matchup data (3 matches, manual entry)            |

After import, every event will have full match data in the unified schema. The `bracketLink` column is preserved on the `Event` model for reference but is no longer the primary data source.

---

## Migration Plan

### Record Inventory (as of March 2026)

| Source                         | Records                                        |
| ------------------------------ | ---------------------------------------------- |
| Cups (`tournaments`)           | 14 events (IDs 1–11, 13–15)                    |
| Championships (`championship`) | 1 event                                        |
| Fight Nights (`fight_night`)   | 2 events                                       |
| Championship participants      | 71 rows                                        |
| Championship matches           | 166 (146 played, 20 unplayed)                  |
| Championship games             | 498                                            |
| Fight night matchups           | 4 matchups (Fight Night I only)                |
| Fight night games              | 11 games                                       |
| **Total unified events**       | **16** (14 + 1 + 2, minus 1 for the duplicate) |

The fight night and cup data is trivial. The championship data is the bulk of the migration.

### Step 1: Create New Tables ✅

Run a Prisma migration to create the 6 new `event_*` tables alongside the existing tables. Add the `EventType`, `EventStatus`, and `BracketFormat` enums.

**Completed:** Migration `20260320000000_add_unified_event_schema` creates `events`, `event_stages`, `event_matches`, `event_match_players`, `event_games`, `event_participants`, `event_placements`, and adds `event_id` FK to `demos`.

### Step 2: Migrate Data

Write a migration script that handles these operations in order:

1. **Insert events.** Insert 16 rows into `events`:
   - 13 cups as `type = CUP`, `status = COMPLETED` (14th cup, Tournament #15, as `status = UPCOMING`)
   - 1 championship as `type = CHAMPIONSHIP`, `status = COMPLETED` (all data is historical — the event is over despite the stale `REGISTRATION` column)
   - 2 fight nights as `type = FIGHT_NIGHT`, `status = COMPLETED`
   - **Merge Tournament #14 and Championship #1** into a single Event row — do not create duplicate entries for the World Championship 2025. Use the championship's `started_at` for registration start, the tournament's `started_at` for event start, and carry over the bracket link from the tournament row.
   - Map `isTeamTournament` → `isTeamEvent`
   - Normalize `prizepool` values (cups have no prizepool field — default to 0)

2. **Create stages for each event.** Every event needs at least 1 `EventStage` row:
   - Each cup → 1 stage (name: "Main Bracket", format based on external bracket data — typically `SINGLE_ELIM`)
   - Fight Night I → 1 stage (name: "Card", format: `CARD`)
   - Fight Night II → 1 stage (name: "Card", format: `CARD`)
   - World Championship → 4 stages:
     - "Group A" (`ROUND_ROBIN`, orderNum: 1)
     - "Group B" (`ROUND_ROBIN`, orderNum: 2)
     - "Day 2 Play-in" (`SINGLE_ELIM`, orderNum: 3)
     - "Top 8 Bracket" (`DOUBLE_ELIM`, orderNum: 4)
   - Stage data for the World Championship comes from the cross-reference file: `data/championship-cross-reference.json`

3. **Migrate participants.** Copy 71 `championship_participant` rows into `event_participants`, pointing at the merged championship Event ID.

4. **Migrate championship matches → event_matches + event_match_players.**
   - Each match belongs to a `stageId` (determined by cross-referencing Discord channel names with the round/group data in the cross-reference file)
   - Map `winner_score` → `side1Score`, `loser_score` → `side2Score` (see [Data Quality Issues](#data-quality-issues) — these are player1/player2 scores despite the column names)
   - Derive `winnerSide`: if `winnerId = player1Id` then `winnerSide = 1`, else `winnerSide = 2`. For unplayed matches, `winnerSide = NULL`.
   - Create 2 `event_match_players` rows per match (one per side)
   - Handle bye entries (steam IDs `'3'`, `'4'`): preserve as-is in `event_match_players` — the bracket renderer can detect byes by username
   - Add `round` numbers from the Discord channel names (the cross-reference file has this mapping)

5. **Migrate fight night matchups → event_matches + event_match_players.**
   - Each matchup belongs to the fight night's single stage
   - `winner_score`/`loser_score` here ARE the winner's and loser's actual scores. Map to `side1Score`/`side2Score` using the `winnerId` to determine which side won.
   - Create 2 `event_match_players` rows per matchup

6. **Migrate games.** Copy `championship_game` rows and fight night `games` rows (where `fight_night_matchups_id IS NOT NULL`) into `event_games`. Map `home_player_score`/`away_player_score` → `side1Score`/`side2Score`.

7. **Convert placement columns.** For each cup in `tournaments`:
   - `winner1SteamId` → `EventPlacement(placement: 1)`
   - `winner2SteamId` → `EventPlacement(placement: 1)` (2v2 partner)
   - `secondPlace1SteamId` / `secondPlace2SteamId` → `EventPlacement(placement: 2)`
   - `thirdPlace1SteamId` / `thirdPlace2SteamId` → `EventPlacement(placement: 3)`
   - Skip empty strings AND NULLs — neither should produce a row
   - For the merged World Championship event, derive placements from the tournament row's winner columns

8. **Migrate demo FKs.** Update the `demos` table: set `event_id` based on existing `tournament_id` and `fight_night_id` mappings. Currently 0 demos use these columns, so the migration is structurally clean — populate the new FK, then the old FKs can be dropped in Step 6.

### Step 3: Import External Bracket Data

This is the step that gives historical events their full bracket structures. See [External Bracket Data Import](#external-bracket-data-import) for context.

1. **Cups from BracketHQ / Challonge**: Import match trees, round structures, and per-match results into `event_matches` + `event_match_players` for the 13 completed cups. This provides the `round` and `orderNum` values that the bracket renderer needs.

2. **Championship round reconstruction**: The 166 championship matches in the DB have no `round` column. The external bracket tool used to manage the championship holds this information. Import round numbers from the external source. If the external source is unavailable, backfill round numbers manually based on the bracket progression.

3. **Fight Night II backfill**: Enter the 3 matchups with 2v2 player data from Discord records. These are flat card matches (`round = NULL`, `orderNum` = display order).

After this step, every historical event has the data needed for the bracket renderer to display it.

### Step 4: Backfill Missing Metadata

- **Fight Night I**: Add name ("Fight Night I"), description, prizepool. Verify Bo3 anomaly on the main event (matchup #1, order 4: `winner_score = 3` in a `bo_series = 3` — likely was Bo5).
- **Fight Night II**: Add name ("Fight Night II"), description, prizepool (120 keys). Match data is handled in Step 3.
- **Resolve placeholder user** `76561198040409232` ("Not logged in") in Fight Night I matchup #2.
- **Championship status**: set the merged Event to `COMPLETED` (all data is historical).

### Step 5: Update Application Code

Services to rewrite or merge:

| File                                       | Change                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `src/lib/server/services/tournaments.ts`   | Primary rewrite — merge all event queries into unified service            |
| `src/lib/server/services/championships.ts` | Delete — functionality absorbed into unified service                      |
| `src/lib/server/services/demos.ts`         | Update demo FK references from `tournamentId`/`fightNightId` to `eventId` |
| `src/lib/server/services/demoReports.ts`   | Update any tournament/fight night references                              |
| `src/lib/server/services/users.ts`         | Update player tournament history queries                                  |

Routes and pages to update:

| File                                      | Change                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/routes/tournaments/+page.server.ts`  | Rewrite to query unified `events` table                                                                          |
| `src/routes/tournaments/+page.svelte`     | Update UI to use unified data structure                                                                          |
| `src/routes/admin/league/+page.server.ts` | Update admin tournament management actions                                                                       |
| `src/routes/users/[steamId]/+page.svelte` | Update player profile fight night/tournament display                                                             |
| Homepage load function                    | Replace `getLatestTournament()`, `getLatestChampionship()`, `getRecentTournamentActivity()` with unified queries |

### Step 6: Drop Old Tables

Once verified, drop `tournaments`, `championship`, `championship_participant`, `championship_match`, `championship_game`, `fight_night`, `fight_night_matchups`, and remove the `fight_night_matchups_id` FK from `games` and the `tournament_id`/`fight_night_id` FKs from `demos`.

---

## Relationship to Bracket Rendering

This schema is the **data contract** that the bracket rendering system consumes. The bracket UI components and services are designed separately in [`docs/proposals/bracket-rendering.md`](bracket-rendering.md).

The bracket renderer needs:

1. **Fetch all stages for an event** → `SELECT * FROM event_stages WHERE event_id = ? ORDER BY order_num`
2. **Fetch all matches per stage** → `SELECT * FROM event_matches WHERE stage_id = ? ORDER BY round, order_num`
3. **Fetch players for each match** → join `event_match_players` (handles 1v1 and 2v2 identically)
4. **Fetch games within a match** → join `event_games`
5. **Determine bracket structure** → `bracket_format` on the **stage** tells the renderer whether it's single elim, double elim, round robin, or a flat card; `round` + `order_num` define the bracket tree within

Each stage maps to one `BracketData` object (the presentation-layer type from `$lib/types/bracket.ts`). The event detail page renders one bracket section per stage. A cup with a single `SINGLE_ELIM` stage renders as one bracket tree. The World Championship renders 4 sections — two group standings tables, a play-in bracket, and a double-elim bracket.

Same component, same query pattern, works for all event types and complexities.

### Execution Sequencing

The bracket rendering proposal must be completed first because:

1. **The renderer validates the schema.** Building bracket UI components against this schema exposes any missing fields, awkward query patterns, or structural issues before data is migrated into it. Changing the schema after migration is expensive; changing it before is free.
2. **The migration has no user-facing value without rendering.** Migrating data between tables while still linking to external brackets produces zero visible improvement. The bracket renderer is what makes the migration worthwhile.
3. **Testing requires both.** The bracket system will be heavily tested and iterated on to ensure it looks good. This is easier with test data in the new schema, but the component interfaces and rendering logic should be designed first.

The work proceeds incrementally:

1. Design and build bracket rendering components (see `bracket-rendering.md`) — plan this with Cursor Plan mode
2. Create the unified schema (this document's Step 1)
3. Import external bracket data + migrate internal records (Steps 2–4)
4. Wire up the bracket renderer to live data, iterate and test
5. Update application code (Step 5)
6. Drop old tables (Step 6)

---

## Action Items

### Prerequisites (before this proposal can execute)

1. [x] **Create `bracket-rendering.md` proposal** — design document covering bracket UI components, services, rendering strategies, and supported formats
2. [x] **Plan and build bracket rendering system** using Cursor Plan mode against `bracket-rendering.md` — Phases 1-5 complete, components tested at `/dev/brackets`
3. [ ] **Test and iterate bracket rendering** until it looks good and handles all format types (Phase 8 polish)

### Data Reconstruction

4. [x] **World Championship data reconstruction** — scraped 95 Discord channels, cross-referenced with BracketHQ/Liquipedia, all gaps resolved. See `data/championship-findings.md`
5. [x] **Consolidated cross-reference file** — `data/championship-cross-reference.json` maps every WC match (92 total across 4 stages) to stage/round/players/scores with source attribution

### Schema & Migration

6. [x] Finalize schema (review field names, indexes, constraints against bracket renderer needs) — added `EventStage` model for multi-stage events
7. [x] Decide on bye entry handling: preserve phantom users in `event_match_players`, bracket renderer detects byes by username
8. [x] Create Prisma migration for new tables + enums — `20260320000000_add_unified_event_schema`
9. [x] Write data migration script (executed and deleted — data is live in unified tables)
10. [x] Import external bracket data from BracketHQ and Challonge (one-time historical import — complete)
11. [x] Backfill Fight Night I and II missing data (names, prizepool, 2v2 matchups)
12. [x] Resolve placeholder user `76561198040409232` in Fight Night I (preserved as display_name only in event_match_players)

### Application Code

11. [x] Rewrite tournament service layer (`tournaments.ts` and `championships.ts` deleted — replaced by `events.ts`; user profile queries migrated to `event_placements` and `event_match_players`)
12. [x] Update demo service FK references (legacy `tournament` and `fightNightMatchup` includes removed from `demos.ts` and `demoReports.ts`)
13. [x] Update all routes and UI components (tournaments page uses `events.ts`; user profile queries unified)
14. [x] Wire bracket renderer to live data from unified schema (`tournaments/[id]` uses `getEventBracketData`)

### Verification & Cleanup

15. [x] Verify all data migrated correctly (16 events, 446 matches, 898 match players, 458 games, 46 placements, 71 participants — DB-verified)
16. [ ] Verify bracket rendering for every historical event
17. [x] Drop old tables and remove stale FK columns from `games` and `demos` (migration `20260323000000_drop_legacy_tournament_tables` applied)
