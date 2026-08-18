# RFC: Format System - Current State & Future Plans

**Author:** Development Team
**Date:** February 15, 2026
**Status:** Implemented (data-driven Format config + dynamic routes)
**Priority:** Done for Ultiduo/BBall team formats

---

## Summary

Formats are rows in the `Format` table with behavior knobs. Signup, leagues, join, payments, and nav read that config instead of branching on `FORMAT_1V1` / `FORMAT_2V2` for roster and payment rules. New team formats (BBall, Ultiduo) are seeded rows, not cloned route trees.

Individual vs team signup still uses two services (`signup1v1.ts` and `teamSignup.ts`). That split is intentional.

---

## Current State

### What the Format Model Stores

```prisma
model Format {
  id                     Int     @id @default(autoincrement())
  name                   String
  code                   String  @unique
  isIndividual           Boolean @default(false)
  minRosterSize          Int     @default(2)
  maxRosterSize          Int     @default(3)
  requiredPaidPlayers    Int     @default(2)
  supportsJoinPassword   Boolean @default(true)
  supportsAcronym        Boolean @default(true)
  supportsReregistration Boolean @default(true)
  themeKey               String  @default("primary")
}
```

### What the app reads at runtime

- `isIndividual` — signup hub/routes, join, checkout teammate picker, listings
- `maxRosterSize` — join / pending-player caps
- `requiredPaidPlayers` — payments, ready-up, admin status
- `supportsAcronym` / `supportsReregistration` — team create and re-register flows
- `themeKey` — format-colored UI

### Dynamic routes

```
/signup/[formatCode]
/signup/[formatCode]/create
/signup/[formatCode]/existing
/leagues/[formatCode]
```

Old `/signup/create` and `/signup/existing` redirect to the 2v2 paths. `/leagues/1v1`, `/leagues/2v2`, and `/signup/1v1` still work because they match `[formatCode]`.

Nav leagues come from formats that already have seasons. The signup hub lists every format with an open signup season.

### Leftover knobs (not enforced yet)

These fields are stored and editable in admin, but runtime does not gate on them yet:

- `minRosterSize` — ready-up does not require this many players on the roster
- `supportsJoinPassword` — team create still always requires a join password

`FORMAT_1V1` / `FORMAT_2V2` remain as seeded-id constants for 1v1-specific display (match scoring, admin withdraw vs disband, profile 1v1 section).

---

## Decision Log

| Date     | Decision                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jan 2026 | Format table created during schema normalization to replace `is1v1` magic integers. CRUD added to admin panel.                                                |
| Feb 2026 | Documented that format behavior is hardcoded despite CRUDable table. Decided this is acceptable under YAGNI. Will revisit if a third format is planned.       |
| Aug 2026 | Implemented data-driven Format fields (roster/payments/flags/themeKey), dynamic `/signup/[formatCode]` and `/leagues/[formatCode]`, seeded Ultiduo and BBall. |
