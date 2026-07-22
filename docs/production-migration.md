# Production Migration Guide

This document explains how to migrate from the old SQLite-based MGE.tf website to the new PostgreSQL-based website-next application.

## Overview

The migration involves:

1. Setting up a fresh PostgreSQL database
2. Running Prisma migrations to create the schema
3. Importing data from the old SQLite database using the migrator tool
4. Verifying everything works correctly

## Prerequisites

### Tools Required

- PostgreSQL server (local or remote)
- Node.js / Bun runtime
- Access to the old production `users.db` SQLite file
- Both repositories cloned:
  - `website-next` (this repo)
  - `migr` folder at `/path/to/migr`

### Environment Setup

**website-next/.env**

```env
DATABASE_URL="postgresql://user:password@host:5432/mgetf"
```

**migr/.env**

```env
DATABASE_URL="postgresql://user:password@host:5432/mgetf"
```

Both should point to the same PostgreSQL database.

---

## Migration Steps

### Step 1: Create Fresh PostgreSQL Database

Connect to your PostgreSQL server and create the database:

```bash
psql -U postgres -c "DROP DATABASE IF EXISTS mgetf;"
psql -U postgres -c "CREATE DATABASE mgetf;"
```

Or if using a remote server:

```bash
psql -h your-host -U your-user -c "DROP DATABASE IF EXISTS mgetf;"
psql -h your-host -U your-user -c "CREATE DATABASE mgetf;"
```

### Step 2: Run All Prisma Migrations

This creates the database schema with all tables and constraints:

```bash
cd /path/to/website-next
bunx prisma migrate deploy
```

You should see output like:

```
5 migrations found in prisma/migrations
Applying migration 20251228050615_initial_schema
Applying migration 20251228050649_add_region_division_link
Applying migration 20251228155054_add_site_content_cms
Applying migration 20251228194503_require_division_region
Applying migration 20251228220643_add_match_creation_deadline
```

### Step 3: Import Data from SQLite

Copy the production `users.db` file to the migrator directory, then run:

```bash
cd /path/to/migr
pnpm migrate full ./users.db
```

This will:

1. Export all data from SQLite to `migration-data.json`
2. Import all data to PostgreSQL
3. **Automatically create region-specific divisions** (see below)
4. Reset all sequences to prevent ID conflicts

### Step 4: Verify Migration

```bash
cd /path/to/website-next
bunx prisma migrate status
```

Should output: `Database schema is up to date!`

---

## Important: Division-Per-Region Logic

### The Problem with Old Data

The old database had "shared" divisions (like "Open", "Newcomer") that applied to ALL regions. Teams from NA and EU could be in the same division.

The new schema requires **each division to belong to a specific region**. This allows:

- Different pricing per region (€ for EU, $ for NA)
- Better organization in admin UI
- Region-specific division management

### How the Migrator Handles This

When importing, the migrator automatically:

1. **Analyzes which regions use each division** by looking at team data
2. **Creates one division per (name, region) combination**
   - Old: `OPEN` (shared)
   - New: `OPEN` (NA), `OPEN` (EU)
3. **Maps teams to the correct region-specific division**

Example output during import:

```
Importing divisions (creating region-specific divisions)...
  Created division "OPEN" for region 1 (old ID: 2 -> new ID: 3)
  Created division "OPEN" for region 2 (old ID: 2 -> new ID: 4)
  Created division "NEWCOMER" for region 1 (old ID: 1 -> new ID: 1)
  Created division "NEWCOMER" for region 2 (old ID: 1 -> new ID: 2)
```

### Verification

After migration, run this SQL to verify no mismatches:

```sql
SELECT COUNT(*) as mismatches
FROM teams t
JOIN divisions d ON t.division_id = d.id
WHERE t.region_id IS NOT NULL
  AND d.region_id IS NOT NULL
  AND t.region_id != d.region_id;
```

Should return `0`.

---

## Troubleshooting

### "Table already exists" during migrate deploy

The database isn't empty. Drop and recreate it:

```bash
psql -U postgres -c "DROP DATABASE mgetf; CREATE DATABASE mgetf;"
```

### "Unique constraint violation" during import

Sequences weren't reset. The migrator should handle this automatically, but if needed:

```bash
cd /path/to/migr
psql -d mgetf -f reset-sequences.sql
```

### "Cannot insert NULL into region_id"

You're running the migrator with an outdated schema. Make sure:

1. Migrations are applied first (`prisma migrate deploy`)
2. Migrator's Prisma client is generated (`cd migr && pnpm generate`)

### Import fails mid-way

If import fails partway through, drop and recreate the database, then start over from Step 1.

---

## Post-Migration Checklist

- [ ] Verify `prisma migrate status` shows "up to date"
- [ ] Check division count: `SELECT COUNT(*) FROM divisions;`
- [ ] Check team count: `SELECT COUNT(*) FROM teams;`
- [ ] Verify no division-region mismatches (SQL above)
- [ ] Test login with Steam
- [ ] Test admin dashboard loads
- [ ] Test creating a new team
- [ ] Test viewing match pages

---

## File Locations

| Component     | Path                                          |
| ------------- | --------------------------------------------- |
| Website-next  | `/path/to/website-next` (this repo)            |
| Migrator      | `/path/to/migr`                                |
| Prisma Schema | `website-next/prisma/schema.prisma`           |
| Migrations    | `website-next/prisma/migrations/`             |
| Old DB        | `users.db` (get from production)              |

---

## Quick Reference Commands

```bash
# Full migration from scratch
psql -U postgres -c "DROP DATABASE IF EXISTS mgetf; CREATE DATABASE mgetf;"
cd /path/to/website-next && bunx prisma migrate deploy
cd /path/to/migr && pnpm migrate full ./users.db

# Check migration status
cd /path/to/website-next && bunx prisma migrate status

# Start the app
cd /path/to/website-next && bun run dev
```

---

## Schema Changes Summary

Key differences from old SQLite schema:

1. **Division.regionId** - Now required (was nullable for "shared" divisions)
2. **Division unique constraint** - `(name, regionId)` allows same name in different regions
3. **Region.currencySymbol** - Each region has its own currency (€, $, etc.)
4. **Global.matchCreationDeadline** - New field for match scheduling
5. **Global.currentMatchWeek** - New field for match scheduling
6. **Timestamp fields converted to DateTime** - See below

### Timestamp Field Conversions

The following fields were stored as integers (Unix timestamps) or strings in SQLite but are now proper `DateTime` in PostgreSQL:

| Table              | Field             | Old Type                    | New Type    |
| ------------------ | ----------------- | --------------------------- | ----------- |
| `players_in_teams` | `left_at`         | `String` ("0" or timestamp) | `DateTime?` |
| `matches`          | `submitted_at`    | `Int` (Unix seconds)        | `DateTime?` |
| `match_comms`      | `created_at`      | `Int` (Unix seconds)        | `DateTime?` |
| `punishment`       | `start_date_time` | `Int` (Unix seconds)        | `DateTime?` |
| `payments`         | `purchase_date`   | `String` (ISO format)       | `DateTime`  |

**The migrator handles conversion automatically:**

- Valid Unix timestamps (≥ year 2000) → converted to DateTime
- Invalid timestamps (< year 2000, like `2025`) → set to NULL
- String "0" or empty → set to NULL
- ISO date strings → parsed directly

---

## Understanding the Migration Architecture

There are **two completely different migration concerns**. This distinction is important for ongoing development.

### 1. Prisma Migrations — Schema Evolution (Ongoing)

**Location:** `website-next/prisma/migrations/`

Prisma migrations handle **schema changes** — adding tables, columns, constraints, indexes. This is used throughout the lifetime of the project.

```bash
# During development: create a new migration
bunx prisma migrate dev --name add_new_feature

# In production: apply pending migrations
bunx prisma migrate deploy
```

**When to use:** Any time you change `prisma/schema.prisma`

### 2. Migrator Tool — Data Migration (One-Time)

**Location:** `/path/to/migr`

The migrator is a **one-time ETL script** for moving data from the old SQLite database to the new PostgreSQL database. It handles:

- Exporting SQLite data to JSON
- Transforming data (timestamps, division-per-region, etc.)
- Importing into PostgreSQL
- Resetting sequences

**When to use:** Only during the initial production migration. Not used for ongoing development.

### Visual Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                      INITIAL SETUP (one-time)                       │
├─────────────────────────────────────────────────────────────────────┤
│  1. Create empty PostgreSQL database                                │
│  2. Apply Prisma migrations → bunx prisma migrate deploy           │
│  3. Run data migrator → pnpm migrate full ./users.db               │
│  4. Verify everything works                                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    ONGOING DEVELOPMENT (forever)                    │
├─────────────────────────────────────────────────────────────────────┤
│  • Schema changes → Prisma migrations only                         │
│  • The migr tool is NEVER used again after initial setup           │
│  • bunx prisma migrate deploy applies new migrations               │
└─────────────────────────────────────────────────────────────────────┘
```

### Why Two Prisma Schemas?

The `migr` tool has its own copy of `schema.prisma` (`migr/prisma/schema.prisma`) because it needs to generate a Prisma client to INSERT data.

**Important:** If you're re-running the full migration from scratch and `website-next`'s schema has changed, you must:

1. Copy the updated schema to `migr/prisma/schema.prisma`
2. Run `pnpm generate` in the migr folder

For normal development, you don't need to touch the migr tool at all.

---

## Contact

If something goes wrong and this doc doesn't help, check git history for context or the conversation where this was implemented (December 2024).
