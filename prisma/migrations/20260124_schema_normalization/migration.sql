-- Schema Normalization Migration
-- Replaces is1v1 magic integer with Format table
-- Replaces hardcoded region columns with ActiveSignupSeason junction table

-- ═══════════════════════════════════════════════════════════════════
-- Step 1: Create formats table and seed data
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE "formats" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "formats_pkey" PRIMARY KEY ("id")
);

-- Create unique index on code
CREATE UNIQUE INDEX "formats_code_key" ON "formats"("code");

-- Seed format data
INSERT INTO "formats" ("id", "name", "code") VALUES 
    (1, '1v1', '1v1'),
    (2, '2v2', '2v2');

-- Reset sequence to next value after seeded data
SELECT setval('formats_id_seq', 2, true);

-- ═══════════════════════════════════════════════════════════════════
-- Step 2: Add format_id to seasons table
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "seasons" ADD COLUMN "format_id" INTEGER;

-- All existing seasons are 2v2
UPDATE "seasons" SET "format_id" = 2;

-- Make format_id required
ALTER TABLE "seasons" ALTER COLUMN "format_id" SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_format_id_fkey" 
    FOREIGN KEY ("format_id") REFERENCES "formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- Step 3: Add format_id to teams table, migrate is_1v1 data
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "teams" ADD COLUMN "format_id" INTEGER;

-- Migrate data: is_1v1=0 → format_id=2 (2v2), is_1v1=1 → format_id=1 (1v1)
UPDATE "teams" SET "format_id" = CASE WHEN "is_1v1" = 1 THEN 1 ELSE 2 END;

-- Make format_id required
ALTER TABLE "teams" ALTER COLUMN "format_id" SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE "teams" ADD CONSTRAINT "teams_format_id_fkey" 
    FOREIGN KEY ("format_id") REFERENCES "formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop the old is_1v1 column
ALTER TABLE "teams" DROP COLUMN "is_1v1";

-- ═══════════════════════════════════════════════════════════════════
-- Step 4: Add format_id to teams_history table, migrate is_1v1 data
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "teams_history" ADD COLUMN "format_id" INTEGER;

-- Migrate data: is_1v1=0 → format_id=2 (2v2), is_1v1=1 → format_id=1 (1v1)
UPDATE "teams_history" SET "format_id" = CASE WHEN "is_1v1" = 1 THEN 1 ELSE 2 END;

-- Make format_id required
ALTER TABLE "teams_history" ALTER COLUMN "format_id" SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE "teams_history" ADD CONSTRAINT "teams_history_format_id_fkey" 
    FOREIGN KEY ("format_id") REFERENCES "formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop the old is_1v1 column
ALTER TABLE "teams_history" DROP COLUMN "is_1v1";

-- ═══════════════════════════════════════════════════════════════════
-- Step 5: Create active_signup_seasons junction table
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE "active_signup_seasons" (
    "region_id" INTEGER NOT NULL,
    "format_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,

    CONSTRAINT "active_signup_seasons_pkey" PRIMARY KEY ("region_id", "format_id")
);

-- Add foreign key constraints
ALTER TABLE "active_signup_seasons" ADD CONSTRAINT "active_signup_seasons_region_id_fkey" 
    FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "active_signup_seasons" ADD CONSTRAINT "active_signup_seasons_format_id_fkey" 
    FOREIGN KEY ("format_id") REFERENCES "formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "active_signup_seasons" ADD CONSTRAINT "active_signup_seasons_season_id_fkey" 
    FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- Step 6: Migrate data from global table to active_signup_seasons
-- Region IDs: NA=1, EU=2, AUS=3, SA=4, ASIA=5
-- All existing signup seasons are 2v2 (format_id=2)
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO "active_signup_seasons" ("region_id", "format_id", "season_id")
SELECT 1, 2, "na_signup_season_id" FROM "global" WHERE "na_signup_season_id" IS NOT NULL
UNION ALL
SELECT 2, 2, "eu_signup_season_id" FROM "global" WHERE "eu_signup_season_id" IS NOT NULL
UNION ALL
SELECT 3, 2, "aus_signup_season_id" FROM "global" WHERE "aus_signup_season_id" IS NOT NULL
UNION ALL
SELECT 4, 2, "sa_signup_season_id" FROM "global" WHERE "sa_signup_season_id" IS NOT NULL
UNION ALL
SELECT 5, 2, "asia_signup_season_id" FROM "global" WHERE "asia_signup_season_id" IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- Step 7: Drop hardcoded region columns from global table
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "global" DROP COLUMN "na_signup_season_id";
ALTER TABLE "global" DROP COLUMN "eu_signup_season_id";
ALTER TABLE "global" DROP COLUMN "aus_signup_season_id";
ALTER TABLE "global" DROP COLUMN "sa_signup_season_id";
ALTER TABLE "global" DROP COLUMN "asia_signup_season_id";
