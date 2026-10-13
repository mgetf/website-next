-- Admin-chosen playoff format for one skill division inside a season.
-- Absence of a row means that division has no playoff format yet.

CREATE TYPE "PlayoffFormat" AS ENUM ('SINGLE_ELIM', 'DOUBLE_ELIM');

CREATE TABLE "season_division_playoffs" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER NOT NULL,
    "division_id" INTEGER NOT NULL,
    "format" "PlayoffFormat" NOT NULL,

    CONSTRAINT "season_division_playoffs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "season_division_playoffs_season_id_division_id_key" ON "season_division_playoffs"("season_id", "division_id");

CREATE INDEX "season_division_playoffs_division_id_idx" ON "season_division_playoffs"("division_id");

ALTER TABLE "season_division_playoffs" ADD CONSTRAINT "season_division_playoffs_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "season_division_playoffs" ADD CONSTRAINT "season_division_playoffs_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
