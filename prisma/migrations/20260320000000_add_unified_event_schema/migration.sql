-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CUP', 'CHAMPIONSHIP', 'FIGHT_NIGHT');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('UPCOMING', 'REGISTRATION', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BracketFormat" AS ENUM ('SINGLE_ELIM', 'DOUBLE_ELIM', 'ROUND_ROBIN', 'CARD');

-- CreateTable
CREATE TABLE "events" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'UPCOMING',
    "is_team_event" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "avatar" TEXT,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prizepool" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bracket_link" TEXT,
    "card" TEXT,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_stages" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "bracket_format" "BracketFormat" NOT NULL,
    "order_num" INTEGER NOT NULL,

    CONSTRAINT "event_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_matches" (
    "id" SERIAL NOT NULL,
    "stage_id" INTEGER NOT NULL,
    "round" INTEGER,
    "order_num" INTEGER NOT NULL,
    "label" TEXT,
    "winner_side" INTEGER,
    "side1_score" INTEGER,
    "side2_score" INTEGER,
    "bo_series" INTEGER NOT NULL DEFAULT 3,
    "status" "MatchStatus" NOT NULL DEFAULT 'UNPLAYED',

    CONSTRAINT "event_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_match_players" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "steam_id" TEXT NOT NULL,
    "side" INTEGER NOT NULL,

    CONSTRAINT "event_match_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_games" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "game_number" INTEGER NOT NULL,
    "side1_score" INTEGER,
    "side2_score" INTEGER,
    "arena_id" INTEGER,
    "played_at" TIMESTAMP(3),

    CONSTRAINT "event_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participants" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "steam_id" TEXT NOT NULL,
    "seed" INTEGER,
    "eliminated" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_placements" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "steam_id" TEXT NOT NULL,
    "placement" INTEGER NOT NULL,

    CONSTRAINT "event_placements_pkey" PRIMARY KEY ("id")
);

-- AlterTable (add event FK to demos)
ALTER TABLE "demos" ADD COLUMN "event_id" INTEGER;

-- CreateIndex
CREATE INDEX "event_stages_event_id_order_num_idx" ON "event_stages"("event_id", "order_num");

-- CreateIndex
CREATE INDEX "event_matches_stage_id_round_order_num_idx" ON "event_matches"("stage_id", "round", "order_num");

-- CreateIndex
CREATE UNIQUE INDEX "event_match_players_match_id_steam_id_key" ON "event_match_players"("match_id", "steam_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_participants_event_id_steam_id_key" ON "event_participants"("event_id", "steam_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_placements_event_id_steam_id_key" ON "event_placements"("event_id", "steam_id");

-- AddForeignKey
ALTER TABLE "event_stages" ADD CONSTRAINT "event_stages_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_matches" ADD CONSTRAINT "event_matches_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "event_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_match_players" ADD CONSTRAINT "event_match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "event_matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_match_players" ADD CONSTRAINT "event_match_players_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_games" ADD CONSTRAINT "event_games_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "event_matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_games" ADD CONSTRAINT "event_games_arena_id_fkey" FOREIGN KEY ("arena_id") REFERENCES "arenas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_placements" ADD CONSTRAINT "event_placements_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_placements" ADD CONSTRAINT "event_placements_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
