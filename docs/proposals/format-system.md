# RFC: Format System - Current State & Future Plans

**Author:** Development Team  
**Date:** February 15, 2026  
**Status:** 📋 Documented (no work planned)  
**Priority:** Low (revisit only if new formats are needed)

---

## Summary

The `Format` model was introduced during the schema normalization effort to replace hardcoded `is1v1` magic integers. While the database table is CRUDable from the admin panel, format-specific behavior is almost entirely hardcoded in application code. This document captures the current state of that gap and outlines what a truly data-driven format system would look like, should we ever need one.

**Decision:** This is intentional and acceptable. YAGNI applies — 1v1 and 2v2 have fundamentally different domain logic (individual signup vs team creation, no roster management vs passwords/invites/roster caps). That semantic gap doesn't collapse cleanly into a config table. We will revisit only if we concretely plan to add a third format.

---

## Current State

### What the Format Model Stores

```prisma
model Format {
  id   Int    @id @default(autoincrement())
  name String // "1v1", "2v2"
  code String @unique // "1v1", "2v2"
}
```

Three fields. No configuration, no rules, no behavior metadata.

### What's Hardcoded in Application Code

#### Magic ID Constants

`src/lib/server/constants/formats.ts` maps format IDs to constants:

```typescript
export const FORMAT_1V1 = 1;
export const FORMAT_2V2 = 2;
```

These are referenced across ~17 files and assume the auto-increment IDs will always be 1 and 2.

#### Separate Route Trees

Each format has its own dedicated routes with entirely separate page implementations:

| Route              | Purpose                  |
| ------------------ | ------------------------ |
| `/signup/1v1`      | 1v1 individual signup    |
| `/signup/create`   | 2v2 team creation        |
| `/signup/existing` | 2v2 team re-registration |
| `/leagues/1v1`     | 1v1 standings page       |
| `/leagues/2v2`     | 2v2 standings page       |

Navigation links to these routes are hardcoded in the layout component.

#### Separate Service Implementations

| Service         | Format | Key Differences                                                                                            |
| --------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| `signup1v1.ts`  | 1v1    | Creates 1-person "teams" with frozen name/avatar. No join password. Immediate `READY` status.              |
| `teamSignup.ts` | 2v2    | Multi-player teams with name/acronym/avatar/password. Status progression: `UNREADY` → `PENDING` → `READY`. |

#### Hardcoded Roster Size

Maximum roster size of 3 (for 2v2 teams) is hardcoded in:

- `teamJoin.ts` — join validation
- `teamManagement.ts` — roster management
- Multiple UI templates (`teams/[id]/edit`, `teams/join`, `invitations`)

#### Format-Specific Branching

- `teamJoin.ts`: Blocks joining 1v1 "teams" entirely
- `teamManagement.ts`: Roster size checks scoped to `FORMAT_2V2`
- `matches.ts`: Detects 1v1 matches for display purposes
- `teams/[id]/+page.server.ts`: Redirects 1v1 entries away from team edit
- Admin panel: Shows "Withdraw" vs "Disband", different column labels per format

### What Happens If You Create "3v3" in Admin

The admin panel lets you create a new format record. That record will:

- Exist in the database
- Have no signup flow (no routes)
- Have no league/standings page
- Have no service logic
- Have no roster size rules
- Not appear in navigation
- Not appear on the signup page

The CRUD capability is effectively a trapdoor.

---

## Known Issues (Minor)

### Magic ID Constants

`FORMAT_1V1 = 1` and `FORMAT_2V2 = 2` are fragile — they assume specific auto-increment values. These should be replaced with `code`-based lookups using the existing unique `code` field on the Format model. This is a small, safe refactor that doesn't require rethinking the architecture.

### Admin CRUD Is Misleading

The admin panel allows creating/editing/deleting formats, which implies the system supports arbitrary formats. Consider either:

- Removing format CRUD from the admin panel (formats become seed data)
- Adding a note in the admin UI that formats require code changes to be functional

---

## Future: Data-Driven Format System

If we reach the point of experimenting with new formats (3v3, 5v5, etc.), the system would need to become truly data-driven. Below is a sketch of what that would involve.

### Extended Format Model

```prisma
model Format {
  id                  Int     @id @default(autoincrement())
  name                String  // "1v1", "2v2", "3v3"
  code                String  @unique
  isIndividual        Boolean @default(false) // true = solo signup, false = team signup
  minRosterSize       Int     @default(2)
  maxRosterSize       Int     @default(3)
  supportsJoinPassword Boolean @default(true)
  supportsAcronym     Boolean @default(true)
  supportsReregistration Boolean @default(true)
  // Potentially: initial status rules, placement logic, etc.
}
```

### Dynamic Routes

Replace static format-specific routes with parameterized ones:

```
/signup/[formatCode]    → replaces /signup/1v1, /signup/create, /signup/existing
/leagues/[formatCode]   → replaces /leagues/1v1, /leagues/2v2
```

The signup flow would branch based on `format.isIndividual` to render either the individual or team signup UI.

### Unified Services

A single `signup.ts` service that reads format configuration to determine:

- Whether to create a solo entry or a team
- Roster size limits
- Which fields are required (password, acronym, etc.)
- Initial status logic

### Scope of Work

This would touch:

- Prisma schema (migration)
- All signup routes and services
- All league/standings routes
- Team join and management services
- Navigation component
- Admin panel
- User profile page (currently has separate 1v1/2v2 sections)
- Match display logic

This is a significant refactor. Only justified if we have concrete plans for a third format.

---

## Decision Log

| Date     | Decision                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jan 2026 | Format table created during schema normalization to replace `is1v1` magic integers. CRUD added to admin panel.                                          |
| Feb 2026 | Documented that format behavior is hardcoded despite CRUDable table. Decided this is acceptable under YAGNI. Will revisit if a third format is planned. |
