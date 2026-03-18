# RFC: Unified Tournament Schema

**Author:** Development Team  
**Date:** February 15, 2026  
**Status:** Pending  
**Priority:** High (prerequisite for in-house bracket system)

---

## Summary

MGE.tf has three types of competitive events under the "Tournaments" umbrella — **Cups**, **World Championships**, and **Fight Nights** — each stored in completely separate table hierarchies with no shared structure. This leads to duplicated match/game schemas, inconsistent data quality, inability to represent 2v2 fight nights, and a fragmented codebase that queries three different table trees to display what is conceptually one listing.

This proposal replaces the three siloed hierarchies with a single unified event model that shares match, game, player, and placement structures, while preserving the ability to differentiate between event types for display and workflow purposes.

This is also a prerequisite for the planned **in-house bracket rendering system**, which needs a single, consistent match structure to render against.

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

**13 cups in the database.**

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

**1 championship in the database.**

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
  bracketFormat BracketFormat?
  description   String?
  avatar        String?
  startedAt     DateTime?
  endedAt       DateTime?
  prizepool     Float          @default(0)

  // Type-specific (nullable)
  bracketLink   String?        // legacy external bracket URL (cups)
  card          String?        // fight card image URL (fight nights)

  matches       EventMatch[]
  participants  EventParticipant[]
  placements    EventPlacement[]

  @@map("events")
}
```

Every event has a name, type, status, and optional prizepool. Type-specific fields like `bracketLink` and `card` are nullable columns — only a few of them, far less waste than maintaining 3 entire table hierarchies.

### Matches

```prisma
model EventMatch {
  id          Int          @id @default(autoincrement())
  eventId     Int
  round       Int?         // bracket round (null for flat/card formats)
  orderNum    Int          // display order within round
  label       String?      // "Main Event", "Quarterfinal 1", etc.
  winnerSide  Int?         // 1 or 2 (null if unplayed)
  side1Score  Int?
  side2Score  Int?
  boSeries    Int          @default(3)
  status      MatchStatus  @default(UNPLAYED)

  event       Event              @relation(fields: [eventId], references: [id])
  players     EventMatchPlayer[]
  games       EventGame[]

  @@map("event_matches")
}
```

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

**Legacy data:** The 13 existing cups have placement data but no match records. Their `winner1SteamId`, `secondPlace1SteamId`, etc. columns map directly into `EventPlacement` rows. They work identically to future events — same query, same display component, no special cases. They just won't have a viewable bracket until match data is backfilled (if ever).

---

## Table Reduction

| Before                               | After                          |
| ------------------------------------ | ------------------------------ |
| `tournaments`                        | `events` (unified)             |
| `championship`                       |                                |
| `fight_night`                        |                                |
| `championship_match`                 | `event_matches` (unified)      |
| `fight_night_matchups`               |                                |
| `championship_game`                  | `event_games` (unified)        |
| fight night rows in `games`          |                                |
| `championship_participant`           | `event_participants` (unified) |
| 6 hardcoded placement columns        | `event_placements` (unified)   |
| **7 tables + shared `games` column** | **5 tables**                   |

---

## Migration Plan

The dataset is small and manageable:

| Source                         | Records                         |
| ------------------------------ | ------------------------------- |
| Cups (`tournaments`)           | 13 events                       |
| Championships (`championship`) | 1 event                         |
| Fight Nights (`fight_night`)   | 2 events                        |
| Championship matches           | ~0 active (registration phase)  |
| Fight night matchups           | 4 matchups (Fight Night I only) |
| Fight night games              | 11 games                        |

### Step 1: Create New Tables

Run a Prisma migration to create the 5 new `event_*` tables alongside the existing tables.

### Step 2: Migrate Data

Write a migration script that:

1. Inserts all 16 events into `events` with appropriate `type` and `status` values
2. Migrates `championship_participant` rows into `event_participants`
3. Migrates `fight_night_matchups` into `event_matches` + `event_match_players`
4. Migrates `championship_match` into `event_matches` + `event_match_players`
5. Migrates `championship_game` and fight night `games` rows into `event_games`
6. Converts the 6 placement columns from cups into `event_placements` rows

### Step 3: Backfill Missing Data

- **Fight Night I**: Add name ("Fight Night I"), description, prizepool
- **Fight Night II**: Add name ("Fight Night II"), description, prizepool (120 keys), and create the 3 matchup records with 2v2 player data from Discord records
- **Resolve placeholder user** `76561198040409232` ("Not logged in") in Fight Night I

### Step 4: Update Application Code

- Rewrite tournament service layer (`src/lib/server/services/tournaments.ts`) to query `events` instead of 3 separate tables
- Update the tournaments page (`src/routes/tournaments/+page.svelte`) to use the unified data structure
- Update player profile fight night display (`src/routes/users/[steamId]/+page.svelte`)
- Update homepage tournament counts and recent activity

### Step 5: Drop Old Tables

Once verified, drop `tournaments`, `championship`, `championship_participant`, `championship_match`, `championship_game`, `fight_night`, `fight_night_matchups`, and remove the fight-night FK from `games`.

---

## How This Enables In-House Brackets

The bracket rendering system needs to:

1. **Fetch all matches for an event** → `SELECT * FROM event_matches WHERE eventId = ? ORDER BY round, orderNum`
2. **Fetch players for each match** → join `event_match_players` (handles 1v1 and 2v2 identically)
3. **Fetch games within a match** → join `event_games`
4. **Determine bracket structure** → `round` + `orderNum` define the bracket tree; `bracketFormat` on the event tells the renderer whether it's single elim, double elim, round robin, or a flat card

One query path. One component. Works for all event types. A fight night with `bracketFormat = CARD` renders as a flat matchup list. A cup with `bracketFormat = SINGLE_ELIM` renders as a bracket tree. Same data, different presentation.

---

## Action Items

1. [ ] Finalize schema (review field names, indexes, constraints)
2. [ ] Create Prisma migration for new tables
3. [ ] Write data migration script
4. [ ] Backfill Fight Night I and II missing data
5. [ ] Rewrite tournament service layer
6. [ ] Update all UI components
7. [ ] Drop old tables
8. [ ] Build bracket rendering system against the unified schema
