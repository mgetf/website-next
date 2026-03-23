-- Drop legacy FK columns from demos (tournament_id, fight_night_id)
-- and games (fight_night_matchups_id). PostgreSQL automatically drops
-- associated FK constraints when the column is dropped.
ALTER TABLE "demos" DROP COLUMN IF EXISTS "tournament_id";
ALTER TABLE "demos" DROP COLUMN IF EXISTS "fight_night_id";
ALTER TABLE "games" DROP COLUMN IF EXISTS "fight_night_matchups_id";

-- Drop legacy tables in FK-safe dependency order.
-- championship_game references championship_match and arena.
DROP TABLE IF EXISTS "championship_game";
-- championship_match references championship and users.
DROP TABLE IF EXISTS "championship_match";
-- championship_participant references championship and users.
DROP TABLE IF EXISTS "championship_participant";
-- championship references users.
DROP TABLE IF EXISTS "championship";
-- fight_night_matchups references fight_night and users.
-- The demos and games FK columns referencing this table were already dropped above.
DROP TABLE IF EXISTS "fight_night_matchups";
-- fight_night has no remaining dependents.
DROP TABLE IF EXISTS "fight_night";
-- tournaments: the demos FK column referencing this table was already dropped above.
DROP TABLE IF EXISTS "tournaments";

-- Drop the legacy enum that was only used by the championship table.
DROP TYPE IF EXISTS "ChampionshipStatus";
