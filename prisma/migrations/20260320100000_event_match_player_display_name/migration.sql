-- Add display_name column with temporary default
ALTER TABLE "event_match_players" ADD COLUMN "display_name" TEXT NOT NULL DEFAULT '';

-- Backfill display_name from users table for linked players
UPDATE "event_match_players" SET "display_name" = u."steam_username"
FROM "users" u WHERE u."steam_id" = "event_match_players"."steam_id";

-- Remove the temporary default
ALTER TABLE "event_match_players" ALTER COLUMN "display_name" DROP DEFAULT;

-- Make steam_id nullable
ALTER TABLE "event_match_players" ALTER COLUMN "steam_id" DROP NOT NULL;

-- Drop old unique index and create new one
DROP INDEX "event_match_players_match_id_steam_id_key";
CREATE UNIQUE INDEX "event_match_players_match_id_display_name_key" ON "event_match_players"("match_id", "display_name");
