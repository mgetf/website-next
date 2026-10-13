-- One place in a division playoff tree. Teams and the match stay empty until later phases fill them.

CREATE TABLE "playoff_slots" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER NOT NULL,
    "division_id" INTEGER NOT NULL,
    "format" "PlayoffFormat" NOT NULL,
    "section" "BracketSection" NOT NULL,
    "round" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "team1_id" INTEGER,
    "team2_id" INTEGER,
    "winner_next_slot_id" INTEGER,
    "winner_next_side" INTEGER,
    "loser_next_slot_id" INTEGER,
    "loser_next_side" INTEGER,
    "match_id" INTEGER,
    "is_bye" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "playoff_slots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "playoff_slots_season_id_division_id_section_round_position_key" ON "playoff_slots"("season_id", "division_id", "section", "round", "position");

CREATE UNIQUE INDEX "playoff_slots_match_id_key" ON "playoff_slots"("match_id");

CREATE INDEX "playoff_slots_season_id_division_id_idx" ON "playoff_slots"("season_id", "division_id");

CREATE INDEX "playoff_slots_winner_next_slot_id_idx" ON "playoff_slots"("winner_next_slot_id");

CREATE INDEX "playoff_slots_loser_next_slot_id_idx" ON "playoff_slots"("loser_next_slot_id");

ALTER TABLE "playoff_slots" ADD CONSTRAINT "playoff_slots_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "playoff_slots" ADD CONSTRAINT "playoff_slots_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "playoff_slots" ADD CONSTRAINT "playoff_slots_team1_id_fkey" FOREIGN KEY ("team1_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "playoff_slots" ADD CONSTRAINT "playoff_slots_team2_id_fkey" FOREIGN KEY ("team2_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "playoff_slots" ADD CONSTRAINT "playoff_slots_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "playoff_slots" ADD CONSTRAINT "playoff_slots_winner_next_slot_id_fkey" FOREIGN KEY ("winner_next_slot_id") REFERENCES "playoff_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "playoff_slots" ADD CONSTRAINT "playoff_slots_loser_next_slot_id_fkey" FOREIGN KEY ("loser_next_slot_id") REFERENCES "playoff_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Podium for a division playoff. place is 1, 2, or 3.

CREATE TABLE "playoff_placements" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER NOT NULL,
    "division_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "place" INTEGER NOT NULL,

    CONSTRAINT "playoff_placements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "playoff_placements_season_id_division_id_place_key" ON "playoff_placements"("season_id", "division_id", "place");

CREATE UNIQUE INDEX "playoff_placements_season_id_division_id_team_id_key" ON "playoff_placements"("season_id", "division_id", "team_id");

CREATE INDEX "playoff_placements_team_id_idx" ON "playoff_placements"("team_id");

ALTER TABLE "playoff_placements" ADD CONSTRAINT "playoff_placements_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "playoff_placements" ADD CONSTRAINT "playoff_placements_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "playoff_placements" ADD CONSTRAINT "playoff_placements_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Arenas in each playoff match. Existing rows keep the previous fixed length of 3.

ALTER TABLE "season_division_playoffs" ADD COLUMN "series" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "season_division_playoffs" ADD CONSTRAINT "season_division_playoffs_series_check" CHECK ("series" IN (3, 5, 7));

-- Games on each playoff arena. Existing rows keep the previous fixed length of 3.

ALTER TABLE "season_division_playoffs" ADD COLUMN "arena_games" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "season_division_playoffs" ADD CONSTRAINT "season_division_playoffs_arena_games_check" CHECK ("arena_games" IN (3, 5, 7));
