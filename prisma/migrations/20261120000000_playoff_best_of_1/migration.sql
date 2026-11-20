-- Allow best-of-1 playoff lengths alongside 3, 5, and 7.
ALTER TABLE "season_division_playoffs" DROP CONSTRAINT "season_division_playoffs_series_check";
ALTER TABLE "season_division_playoffs" ADD CONSTRAINT "season_division_playoffs_series_check" CHECK ("series" IN (1, 3, 5, 7));
ALTER TABLE "season_division_playoffs" DROP CONSTRAINT "season_division_playoffs_arena_games_check";
ALTER TABLE "season_division_playoffs" ADD CONSTRAINT "season_division_playoffs_arena_games_check" CHECK ("arena_games" IN (1, 3, 5, 7));
