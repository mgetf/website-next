-- Classes a rostered player is not allowed to play. Empty means no restriction.
ALTER TABLE "players_in_teams"
ADD COLUMN IF NOT EXISTS "restricted_class_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
