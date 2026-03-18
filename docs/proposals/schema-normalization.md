# RFC: Schema Normalization - Eliminate Hardcoded Formats & Regions

**Author:** Development Team  
**Date:** January 4, 2026  
**Status:** ✅ Completed  
**Completed:** January 24, 2026  
**Priority:** High (blocks 1v1 league implementation)

---

## Summary

This proposal eliminates all hardcoded references to formats (1v1, 2v2) and regions (NA, EU, etc.) from the database schema. This is a prerequisite for cleanly implementing 1v1 leagues and makes the system extensible for future formats or regions.

---

## Problems Identified

### 🔴 Critical Issues

#### 1. Global Table: Hardcoded Region Columns

```prisma
model Global {
  naSignupSeasonId      Int?  // ❌ Hardcoded to NA
  euSignupSeasonId      Int?  // ❌ Hardcoded to EU
  ausSignupSeasonId     Int?  // ❌ Hardcoded to AUS
  saSignupSeasonId      Int?  // ❌ Hardcoded to SA
  asiaSignupSeasonId    Int?  // ❌ Hardcoded to ASIA
}
```

**Impact:**

- Adding a new region requires a schema migration
- Code has hardcoded switch statements mapping region IDs to columns
- Adding 1v1 would double these columns (10 total)

#### 2. Team/TeamHistory: Magic Integer for Format

```prisma
model Team {
  is1v1  Int  @default(0)  // ❌ Magic number: 0=2v2, 1=1v1
}
```

**Impact:**

- No semantic meaning (`team.is1v1 === 0` instead of `team.format.code === '2v2'`)
- Adding 3v3 would require changing all 0/1 checks
- ~15+ code locations check this field

#### 3. Season: No Format Association

```prisma
model Season {
  // ❌ No way to know if this is a 1v1 or 2v2 season
}
```

### 🟡 Deferred Issues (RBAC)

The following issues use magic integers for authorization but will be addressed in a future **RBAC (Role-Based Access Control)** migration:

- `Moderator.staffType` - magic int (0=Head Admin, 1=Moderator)
- `PlayerInTeam.permissionLevel` - magic int (-2=Left, 0=Member, 1=Admin, 2=Owner)

These are **not in scope** for this migration.

---

## Proposed Solution

### New Tables

```prisma
// ═══════════════════════════════════════════════════════════════════
// NEW: Format table (replaces is1v1 fields)
// ═══════════════════════════════════════════════════════════════════
model Format {
  id    Int    @id @default(autoincrement())
  name  String // Display name: "1v1", "2v2", "3v3"
  code  String @unique // Lookup key: "1v1", "2v2", "3v3"

  seasons              Season[]
  teams                Team[]
  teamHistory          TeamHistory[]
  activeSignupSeasons  ActiveSignupSeason[]

  @@map("formats")
}

// ═══════════════════════════════════════════════════════════════════
// NEW: Active signup seasons junction table
// Replaces: Global.naSignupSeasonId, euSignupSeasonId, etc.
// ═══════════════════════════════════════════════════════════════════
model ActiveSignupSeason {
  regionId   Int @map("region_id")
  formatId   Int @map("format_id")
  seasonId   Int @map("season_id")

  region   Region @relation(fields: [regionId], references: [id])
  format   Format @relation(fields: [formatId], references: [id])
  season   Season @relation(fields: [seasonId], references: [id])

  @@id([regionId, formatId])  // One active season per region+format combo
  @@map("active_signup_seasons")
}
```

### Modified Tables

```prisma
// ═══════════════════════════════════════════════════════════════════
// MODIFIED: Season - add formatId
// ═══════════════════════════════════════════════════════════════════
model Season {
  id        Int @id @default(autoincrement())
  seasonNum Int @map("season_num")
  numWeeks  Int @map("num_weeks")
  regionId  Int @map("region_id")
  formatId  Int @map("format_id")  // ✅ NEW: FK to Format

  region              Region @relation(fields: [regionId], references: [id])
  format              Format @relation(fields: [formatId], references: [id])
  activeSignupSeasons ActiveSignupSeason[]
  // ... rest unchanged

  // ❌ REMOVED: globalNA, globalEU, globalAUS, globalSA, globalASIA relations

  @@map("seasons")
}

// ═══════════════════════════════════════════════════════════════════
// MODIFIED: Team - formatId instead of is1v1
// ═══════════════════════════════════════════════════════════════════
model Team {
  id        Int @id @default(autoincrement())
  // ... existing fields ...
  formatId  Int @map("format_id")  // ✅ NEW: replaces is1v1
  // ❌ REMOVED: is1v1

  format   Format @relation(fields: [formatId], references: [id])
  // ... rest unchanged

  @@map("teams")
}

// ═══════════════════════════════════════════════════════════════════
// MODIFIED: TeamHistory - formatId instead of is1v1
// ═══════════════════════════════════════════════════════════════════
model TeamHistory {
  // ... existing fields ...
  formatId  Int @map("format_id")  // ✅ NEW: replaces is1v1
  // ❌ REMOVED: is1v1

  format   Format @relation(fields: [formatId], references: [id])

  @@map("teams_history")
}

// ═══════════════════════════════════════════════════════════════════
// MODIFIED: Global - remove hardcoded region columns AND per-season settings
// (per-season settings moved to Season model - see below)
// ═══════════════════════════════════════════════════════════════════
model Global {
  id         Int @id @default(autoincrement())
  leagueFees Int @default(0) @map("league_fees")

  // ❌ REMOVED: naSignupSeasonId, euSignupSeasonId, ausSignupSeasonId,
  //            saSignupSeasonId, asiaSignupSeasonId
  // ❌ REMOVED: All region-specific Season relations
  // ❌ REMOVED: signupClosed, rosterLocked, paymentRequired (moved to Season)
  // ❌ REMOVED: matchCreationDeadline, currentMatchWeek (moved to Season)

  @@map("global")
}

// ═══════════════════════════════════════════════════════════════════
// MODIFIED: Season - add formatId AND per-season settings
// ═══════════════════════════════════════════════════════════════════
// Note: Added beyond original scope - these settings are now per-season
// instead of global, allowing independent control per region/format
model Season {
  // ... existing fields ...
  formatId        Int       @map("format_id")       // ✅ NEW: FK to Format
  signupsOpen     Boolean   @default(false)         // ✅ NEW: per-season signup control
  rosterLocked    Boolean   @default(false)         // ✅ NEW: per-season roster lock
  paymentRequired Boolean   @default(false)         // ✅ NEW: per-season payment req
  matchWeek       Int?      @map("match_week")      // ✅ NEW: per-season match week
  matchDeadline   DateTime? @map("match_deadline")  // ✅ NEW: per-season deadline

  format Format @relation(fields: [formatId], references: [id])
  // ...
}

// ═══════════════════════════════════════════════════════════════════
// MODIFIED: Region - add relation to ActiveSignupSeason
// ═══════════════════════════════════════════════════════════════════
model Region {
  id                  Int    @id @default(autoincrement())
  name                String
  hidden              Int    @default(0)
  currencySymbol      String @default("€") @map("currency_symbol")

  seasons             Season[]
  teams               Team[]
  divisions           Division[]
  activeSignupSeasons ActiveSignupSeason[]  // ✅ NEW

  @@map("regions")
}
```

---

## Migration Plan

### Step 1: Create Format table + seed data

```sql
CREATE TABLE formats (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL
);

INSERT INTO formats (id, name, code) VALUES
  (1, '1v1', '1v1'),
  (2, '2v2', '2v2');

-- Reset sequence
SELECT setval('formats_id_seq', (SELECT MAX(id) FROM formats));
```

### Step 2: Add formatId to Season

```sql
ALTER TABLE seasons ADD COLUMN format_id INTEGER REFERENCES formats(id);
-- All existing seasons are 2v2
UPDATE seasons SET format_id = 2;
ALTER TABLE seasons ALTER COLUMN format_id SET NOT NULL;
```

### Step 3: Add formatId to Team + migrate is1v1 data

```sql
ALTER TABLE teams ADD COLUMN format_id INTEGER REFERENCES formats(id);
-- Migrate: is_1v1=0 → format_id=2 (2v2), is_1v1=1 → format_id=1 (1v1)
UPDATE teams SET format_id = CASE WHEN is_1v1 = 1 THEN 1 ELSE 2 END;
ALTER TABLE teams ALTER COLUMN format_id SET NOT NULL;
ALTER TABLE teams DROP COLUMN is_1v1;
```

### Step 4: Add formatId to TeamHistory + migrate is1v1 data

```sql
ALTER TABLE teams_history ADD COLUMN format_id INTEGER REFERENCES formats(id);
UPDATE teams_history SET format_id = CASE WHEN is_1v1 = 1 THEN 1 ELSE 2 END;
ALTER TABLE teams_history ALTER COLUMN format_id SET NOT NULL;
ALTER TABLE teams_history DROP COLUMN is_1v1;
```

### Step 5: Create ActiveSignupSeason table

```sql
CREATE TABLE active_signup_seasons (
  region_id INTEGER NOT NULL REFERENCES regions(id),
  format_id INTEGER NOT NULL REFERENCES formats(id),
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  PRIMARY KEY (region_id, format_id)
);
```

### Step 6: Migrate Global data to ActiveSignupSeason

```sql
-- Migrate each region's current signup season (all 2v2 format)
INSERT INTO active_signup_seasons (region_id, format_id, season_id)
SELECT 1, 2, na_signup_season_id FROM global WHERE na_signup_season_id IS NOT NULL
UNION ALL
SELECT 2, 2, eu_signup_season_id FROM global WHERE eu_signup_season_id IS NOT NULL
UNION ALL
SELECT 3, 2, aus_signup_season_id FROM global WHERE aus_signup_season_id IS NOT NULL
UNION ALL
SELECT 4, 2, sa_signup_season_id FROM global WHERE sa_signup_season_id IS NOT NULL
UNION ALL
SELECT 5, 2, asia_signup_season_id FROM global WHERE asia_signup_season_id IS NOT NULL;
```

### Step 7: Remove hardcoded columns from Global

```sql
ALTER TABLE global
  DROP COLUMN na_signup_season_id,
  DROP COLUMN eu_signup_season_id,
  DROP COLUMN aus_signup_season_id,
  DROP COLUMN sa_signup_season_id,
  DROP COLUMN asia_signup_season_id;
```

---

## Code Changes Required

### Constants File (New)

```typescript
// lib/server/constants/formats.ts
export const FORMAT_1V1 = 1;
export const FORMAT_2V2 = 2;
```

### Before → After Examples

#### Getting current signup season

```typescript
// ❌ BEFORE: Hardcoded switch statement
switch (regionId) {
  case 1:
    seasonId = global.naSignupSeasonId;
    break;
  case 2:
    seasonId = global.euSignupSeasonId;
    break;
  case 3:
    seasonId = global.ausSignupSeasonId;
    break;
  case 4:
    seasonId = global.saSignupSeasonId;
    break;
  case 5:
    seasonId = global.asiaSignupSeasonId;
    break;
}

// ✅ AFTER: Dynamic lookup
const activeSignup = await prisma.activeSignupSeason.findUnique({
  where: { regionId_formatId: { regionId, formatId } },
});
const seasonId = activeSignup?.seasonId;
```

#### Checking format

```typescript
// ❌ BEFORE: Magic number
if (team.is1v1 === 0) { ... }
team: { is1v1: 0 }

// ✅ AFTER: Semantic
if (team.formatId === FORMAT_2V2) { ... }
// Or with relation loaded:
if (team.format.code === '2v2') { ... }
team: { formatId: FORMAT_2V2 }
```

#### Getting all current signup seasons

```typescript
// ❌ BEFORE: Hardcoded array
const currentSeasonIds = [
  global.naSignupSeasonId,
  global.euSignupSeasonId,
  global.ausSignupSeasonId,
  global.saSignupSeasonId,
  global.asiaSignupSeasonId,
].filter((id): id is number => id !== null);

// ✅ AFTER: Dynamic query
const activeSignups = await prisma.activeSignupSeason.findMany({
  where: { formatId: FORMAT_2V2 },
});
const currentSeasonIds = activeSignups.map((a) => a.seasonId);
```

### Files Requiring Updates

| File                                    | Changes                                             |
| --------------------------------------- | --------------------------------------------------- |
| `lib/server/services/users.ts`          | `getCurrentSignupSeasonIds()`                       |
| `lib/server/services/teamManagement.ts` | `getCurrentSignupSeasonIds()`, `is1v1` → `formatId` |
| `lib/server/services/teamSignup.ts`     | Region→season mapping, `is1v1` → `formatId`         |
| `lib/server/services/teamJoin.ts`       | `getCurrentSignupSeasonIds()`, `is1v1` → `formatId` |
| `lib/server/services/payments.ts`       | `getCurrentSignupSeasonIds()`                       |
| `lib/server/services/settings.ts`       | Region→season field mapping                         |
| `routes/signup/*.ts`                    | Region→season mapping                               |
| `routes/admin/global/*`                 | Signup season management UI                         |
| `routes/teams/*/+page.server.ts`        | `is1v1` → `formatId` checks                         |

**Estimated code locations:** ~20-25 files

---

## Admin Panel Changes

### Current: Hardcoded region dropdowns

Each region has its own dropdown for selecting the signup season.

### After: Dynamic table

A table showing all region+format combinations with their active signup season:

| Region | Format | Active Season | Actions  |
| ------ | ------ | ------------- | -------- |
| NA     | 2v2    | Season 5      | [Change] |
| NA     | 1v1    | Season 1      | [Change] |
| EU     | 2v2    | Season 4      | [Change] |
| EU     | 1v1    | —             | [Set]    |
| ...    | ...    | ...           | ...      |

This automatically scales to any number of regions and formats.

---

## What's NOT in Scope

### Authorization/Roles (Future RBAC Migration)

The following will be addressed in a future **RBAC (Role-Based Access Control)** implementation:

- `Moderator.staffType` - magic int for staff roles
- `PlayerInTeam.permissionLevel` - magic int for team roles

**Why deferred:**

- Authorization is a cross-cutting concern
- Requires careful design of role hierarchy
- ~30+ code locations affected
- Better to do as dedicated RBAC migration

### Tournament.isTeamTournament

Boolean flag for team vs individual tournaments.

**Why deferred:**

- Only one field
- Clear boolean semantics
- Tournaments are separate from league system

---

## Effort Estimate

| Task                       | Effort     |
| -------------------------- | ---------- |
| Schema migration (7 steps) | 1-2 hours  |
| Create constants file      | 15 min     |
| Update services (~8 files) | 2-3 hours  |
| Update routes (~5 files)   | 1-2 hours  |
| Update admin panel         | 2-3 hours  |
| Testing                    | 2-3 hours  |
| **Total**                  | **~1 day** |

---

## Benefits

1. ✅ **No hardcoded regions** - add new regions without schema changes
2. ✅ **No hardcoded formats** - add 3v3, 4v4 without schema changes
3. ✅ **No magic numbers** - semantic code (`team.format.code === '2v2'`)
4. ✅ **Proper normalization** - follows database best practices
5. ✅ **Cleaner code** - no more switch statements for region mapping
6. ✅ **Prerequisite for 1v1** - enables clean 1v1 league implementation

---

## Testing Checklist

- [x] Existing 2v2 teams still work
- [x] Signup flow works for all regions
- [x] Match pages display correctly
- [x] Standings pages work
- [x] Admin panel can manage signup seasons (new UI)
- [x] Creating new seasons works with format selection
- [x] Per-season settings (signup/roster/payment) work independently

---

## Completion Notes

All steps completed on January 24, 2026:

1. ✅ Proposal reviewed and approved
2. ✅ Prisma migrations created and applied
3. ✅ Code updated across ~25 files
4. ✅ Admin panel updated with new per-season controls
5. ✅ Tested and verified
6. ✅ 1v1 league implementation completed (see [1v1-leagues.md](./1v1-leagues.md))

**Additional scope completed:**

- Per-season settings migration (signup/roster/payment controls moved from Global to Season)
- Format filtering on league pages (2v2 page only shows 2v2 seasons, etc.)

---

## Appendix: Full Schema Diff

See the "Proposed Solution" section for complete before/after schema changes.
