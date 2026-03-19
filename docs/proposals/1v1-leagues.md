# RFC: 1v1 League Implementation

**Author:** Development Team  
**Date:** January 2, 2026  
**Status:** ✅ Completed  
**Completed:** January 24, 2026  
**Prerequisite:** [Schema Normalization](./schema-normalization.md) ✅

---

## ✅ Prerequisite Complete

The **Schema Normalization** proposal was completed on January 24, 2026:

- ✅ `Format` table created (replacing `is1v1` magic integers)
- ✅ `ActiveSignupSeason` table created (replacing hardcoded region columns)
- ✅ Per-season settings added (signup/roster/payment controls per season)
- ✅ Clean 1v1 support enabled with `formatId`

---

## Summary

This proposal outlines the implementation of 1v1 leagues where players sign up as individuals rather than through teams. The key constraint is working within the current database schema, which is team-centric.

## Background

The current MGE.tf infrastructure is built around **teams** as the primary competitive entity:

- `Match` references `Team` (homeTeamId, awayTeamId, winnerId)
- `Team` has players via `PlayerInTeam`
- Signup flow creates teams with rosters
- Standings, match pages, and navigation all center on teams

For 2v2 leagues, this makes sense. For 1v1 leagues, we need players to sign up as individuals.

## Options Considered

### Option A: New Dedicated 1v1 Models

Create entirely separate database models:

- `League1v1Participant` (player + season + division + stats)
- `Match1v1` (player1Id, player2Id, winnerId)
- `Game1v1`, `MatchComm1v1`, etc.

**Pros:**

- Clean conceptual separation
- No "fake teams" in the database

**Cons:**

- **Massive code duplication** (~1-2 weeks of work)
- Every service, route, and component needs a 1v1 variant
- Double maintenance burden going forward
- Match infrastructure (map bans, demos, comms) would need reimplementing

### Option B: 1-Person Teams with Format Flag ✅ (Recommended)

Use the existing team infrastructure with `formatId = FORMAT_1V1`. The "team" is purely an implementation detail that users never see.

> **Note:** After schema normalization, teams will use `formatId` (FK to Format table) instead of the `is1v1` magic integer.

**Pros:**

- Reuses 95% of existing infrastructure
- Matches, games, demos, map bans, scheduling all work
- ~2-3 days of development

**Cons:**

- Conceptually odd (but hidden from users)
- Requires careful UI/UX work to hide the team abstraction

## Proposed Solution: Option B

We will use 1-person teams with `is1v1: 1`, but **heavily emphasize hiding the team concept from users**. A 1v1 "team" is never shown to users as a team—it's purely a database implementation detail.

---

## Implementation Details

### 1. 1v1 Team Creation

When a player signs up for 1v1:

| Field          | Value                                        |
| -------------- | -------------------------------------------- |
| `name`         | Player's Steam username _(frozen at signup)_ |
| `avatar`       | Player's Steam avatar _(frozen at signup)_   |
| `acronym`      | `null`                                       |
| `joinPassword` | `null`                                       |
| `is1v1`        | `1`                                          |
| `divisionId`   | Selected division                            |
| `regionId`     | Selected region                              |
| `seasonId`     | Current 1v1 season                           |

The player is automatically added as the sole member with `permissionLevel: 2` (owner).

> **Note:** The team name and avatar are captured at signup time and do not sync with subsequent Steam profile changes. This is intentional—players cannot modify their 1v1 entry details, and since it's hidden as a "team" anyway, this ensures consistency for the season.

### 2. UI/UX Changes

#### Navigation (User Dropdown)

- **Current:** Shows "My Team: Team Name" for all team members
- **1v1:** Hide "My Team" link entirely — player already has "My Profile"

```
// Logic
if (userTeam && userTeam.is1v1 === 0) {
    show "My Team" link
}
```

#### Signup Flow

- **New route:** `/signup/1v1`
- Simplified form: just division + region selection
- No team name input (uses player name)
- No password (no one can join)
- No roster management
- Confirmation shows "You're signed up for 1v1" not "Team created"

#### Match Page

- **Current:** Shows team names, team avatars, links to `/teams/[id]`
- **1v1:** Show player names, player avatars, links to `/users/[steamId]`

```svelte
{#if match.homeTeam.is1v1}
  <!-- Show player info -->
  <a href="/users/{homePlayer.steamId}">
    <img src={homePlayer.steamAvatar} />
    {homePlayer.steamUsername}
  </a>
{:else}
  <!-- Show team info (existing) -->
{/if}
```

#### Standings Page

- **New route:** `/leagues/1v1`
- Shows player names and avatars (not team names)
- Links to player profiles (not team pages)
- Column header: "Player" instead of "Team"

#### Team Page Redirect

- If someone navigates to `/teams/[id]` for a 1v1 team → **redirect to player profile**

```typescript
// /teams/[id]/+page.server.ts
if (team.is1v1 === 1) {
  const player = team.players.find((p) => p.active === 1);
  throw redirect(301, `/users/${player.playerSteamId}`);
}
```

#### Team Edit/Join Pages

- `/teams/[id]/edit` → Redirect to profile if `is1v1`
- `/teams/[id]/join` → Already blocks 1v1 teams (existing code)

#### Player Profile

- Add new section: "1v1 League" showing current 1v1 entry stats
- Keep existing "Current Teams" section for 2v2 teams
- Don't show 1v1 entries in "Team History" — show in dedicated 1v1 section

### 3. Backend Changes

#### `getUserActiveTeam()` Service

- Modify to exclude `is1v1` teams from "My Team" display
- Or return an `is1v1` flag so UI can decide

#### Match Detail Loading

- When loading a 1v1 match, include the player data for each team
- Player info needed: `steamId`, `steamUsername`, `steamAvatar`

#### New Services

- `1v1LeagueSignup` service: Creates team + player membership in one transaction

### 4. Database

**After schema normalization is complete:**

The schema will have:

- `Format` table with entries for "1v1" and "2v2"
- `Team.formatId` (FK to Format) instead of `is1v1`
- `Season.formatId` (FK to Format) for season distinction
- `ActiveSignupSeason` table for region+format → season mapping

**For 1v1 implementation:**

1. **Create 1v1 seasons** in admin panel with `formatId = FORMAT_1V1`
2. **Set active signup seasons** via `ActiveSignupSeason` table:
   - `{ regionId: 1, formatId: 1, seasonId: <NA 1v1 season> }`
   - `{ regionId: 2, formatId: 1, seasonId: <EU 1v1 season> }`
   - etc.

No additional schema changes needed beyond what the normalization provides.

---

## User Experience Flow

### 1v1 Signup Flow

```
1. User clicks "Sign Up for 1v1 League" on /signup
2. Redirected to /signup/1v1
3. Selects division and region
4. Clicks "Sign Up"
5. Behind the scenes: Team created with is1v1=1, user added as member
6. Confirmation: "You're signed up for the 1v1 league!"
7. Redirected to their profile or 1v1 standings
```

### Match Experience

```
1. User visits /matches/[id] for a 1v1 match
2. Sees "PlayerA vs PlayerB" (not "TeamA vs TeamB")
3. Player names link to profiles
4. Player avatars shown
5. All other match features work: scores, map bans, comms, demos
```

### Standings Experience

```
1. User visits /leagues/1v1
2. Sees standings by division
3. Each row shows player avatar, player name, record
4. Clicking a player goes to their profile
```

---

## What Stays the Same

These features work unchanged:

- Match scheduling
- Score submission
- Map ban/pick system
- Demo uploads
- Match communications
- Dispute system
- Payment system (per-player-per-season)
- Admin match management

---

## Implementation Phases

### Phase 0: Schema & Admin Setup ✅

- [x] Per-season settings added to `Season` model (replaced global settings)
- [x] Update admin panel to manage 1v1 signup seasons independently
- [x] Admin panel shows per-season toggles for signup/roster/payment

### Phase 1: Core Infrastructure ✅

- [x] Modify `getUserActiveTeam()` to handle 1v1 (excludes 1v1 from "My Team")
- [x] Create `signup1v1` service (freezes name/avatar at signup)
- [x] Create `/signup/1v1` route and page
- [x] Add 1v1 team page redirects to player profile

### Phase 2: Match Display ✅

- [x] Update match page for 1v1 rendering (player names/avatars)
- [x] Load player data for 1v1 matches via `getMatchDetails()`
- [x] Match service includes `is1v1`, `homePlayer`, `awayPlayer` fields

### Phase 3: Standings & Navigation ✅

- [x] Create `/leagues/1v1` page with player standings
- [x] Update navigation to hide "My Team" for 1v1 players
- [x] Add 1v1 section to player profiles (`/users/[steamId]`)

### Phase 4: Polish ✅

- [x] Format filtering on league pages (2v2 only shows 2v2, etc.)
- [x] Region buttons only show for regions with seasons in that format
- [x] Signup page toggle between 2v2 and 1v1 modes
- [x] Testing complete

---

## Decisions Made

> Resolved by ampere on January 4, 2026

### 1. Division Structure

**Q:** Will 1v1 use the same divisions as 2v2, or separate ones?

**A:** Divisions are stored as entities in a ranked order. They can be used in both 1v1 and 2v2. Need to verify database schema to confirm the best approach, but sharing divisions is feasible.

### 2. Season Structure

**Q:** Will 1v1 have its own seasons, or share with 2v2?

**A:** **1v1 will have its own separate seasons.** They will share the same `Season` model and infrastructure. If needed, we may add new properties to the `Season` entity to distinguish 1v1 vs 2v2 seasons (e.g., a `format` or `is1v1` field on Season).

### 3. Signup Timing

**Q:** Can 1v1 signups be open/closed independently from 2v2?

**A:** **Yes, absolutely.** There's no reason 1v1 league should be tied to 2v2 league in any way. The signup open/closed state should be independent.

> **Implementation note:** This means we need separate global settings for 1v1 signup state, e.g., `signupClosed1v1` or a per-season toggle.

### 4. Payment

**Q:** Same fee structure as 2v2, or different?

**A:** **Same structure.** Players pay and get signed up immediately after. No difference in how payments work.

### 5. Simultaneous 1v1 + 2v2

**Q:** Can a player be in both 1v1 and 2v2 simultaneously?

**A:** **Yes.** The current schema supports this and we will allow it.

### 6. 1v1 Team Naming

**Q:** Should the 1v1 "team" name sync with the player's current Steam username, or freeze at signup time?

**A:** **Freeze at signup time.** The 1v1 "team" name and avatar are locked to the player's name/avatar at the moment of signup. Players should NOT be able to modify their internal team's details. Since the team isn't seen as a "team" externally, this is purely for internal consistency.

---

## Alternatives Not Chosen

### "Just use 1-person teams without hiding them"

Users would see team pages, "My Team" links, team names in matches. This creates a confusing UX where players wonder why they have a "team" when playing solo.

### "Wait for a schema rewrite"

A cleaner schema (Roster-based, format-agnostic) would solve this elegantly, but requires ~1-2 weeks of core infrastructure work. Not practical for near-term 1v1 launch.

---

## Conclusion

By using 1v1-format teams (with `formatId = FORMAT_1V1`) and comprehensive UI hiding, we can deliver 1v1 leagues in ~3 days while reusing nearly all existing infrastructure. Users will experience a clean 1v1 signup and match flow without ever seeing "team" language.

The technical debt is minimal—just conditional rendering in a few components. With the schema normalization complete, the foundation will be clean and extensible for future formats.

---

## Completion Notes

Implementation completed on January 24, 2026.

**What was built:**

- `/signup/1v1` - 1v1 signup flow with region/division selection
- `/leagues/1v1` - 1v1 standings page with player names/avatars
- `/matches/[id]` - 1v1 matches display player info instead of team info
- `/users/[steamId]` - Player profiles show 1v1 entries in dedicated section
- Admin panel - Per-season settings (signup/roster/payment) for independent control

**Additional improvements made during implementation:**

- Per-season settings (moved from Global to Season model)
- Format filtering on league pages (prevents 1v1 seasons showing on 2v2 page)
- Region buttons only display for regions with seasons in current format

See [changelog-summary.md](../changelog-summary.md) for user-facing summary.
