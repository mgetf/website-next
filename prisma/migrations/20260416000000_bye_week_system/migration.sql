-- Add BYE_WEEK to NotificationType enum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BYE_WEEK';

-- Create bye_weeks table
CREATE TABLE IF NOT EXISTS "bye_weeks" (
    "id" SERIAL NOT NULL,
    "team_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "season_no" INTEGER NOT NULL,
    "week_no" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bye_weeks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "bye_weeks_team_id_season_id_week_no_key"
    ON "bye_weeks"("team_id", "season_id", "week_no");

ALTER TABLE "bye_weeks"
    ADD CONSTRAINT "bye_weeks_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bye_weeks"
    ADD CONSTRAINT "bye_weeks_season_id_fkey"
    FOREIGN KEY ("season_id") REFERENCES "seasons"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Mark BYE WEEK placeholder team(s) as DEAD so they never appear in standings or pairings.
-- We do not DELETE because of FK references (matches, players_in_teams, etc.).
-- The team will be invisible in all public-facing queries that filter on status != DEAD.
UPDATE "teams"
SET "status" = 'DEAD', "name" = '[REMOVED] BYE WEEK'
WHERE LOWER("name") LIKE '%bye week%';
