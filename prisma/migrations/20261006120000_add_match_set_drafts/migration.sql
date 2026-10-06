-- CreateEnum
CREATE TYPE "MatchSetDraftStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DISCARDED');

-- CreateTable
CREATE TABLE "match_set_drafts" (
    "id" SERIAL NOT NULL,
    "status" "MatchSetDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "region_id" INTEGER NOT NULL,
    "division_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "season_no" INTEGER NOT NULL,
    "week_no" INTEGER,
    "bo_series" INTEGER NOT NULL,
    "bo_games" INTEGER,
    "arena_id" INTEGER,
    "match_date_time" TEXT,
    "match_timezone" TEXT,
    "map_ban_pool_id" INTEGER,
    "is_playoff" BOOLEAN NOT NULL DEFAULT false,
    "playoff_id" INTEGER,
    "playoff_round" INTEGER,
    "pairings" JSONB NOT NULL,
    "bye_team_ids" JSONB NOT NULL DEFAULT '[]',
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "published_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "match_set_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_set_drafts_status_created_at_idx" ON "match_set_drafts"("status", "created_at");

-- CreateIndex
CREATE INDEX "match_set_drafts_season_id_status_idx" ON "match_set_drafts"("season_id", "status");

-- AddForeignKey
ALTER TABLE "match_set_drafts" ADD CONSTRAINT "match_set_drafts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_set_drafts" ADD CONSTRAINT "match_set_drafts_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_set_drafts" ADD CONSTRAINT "match_set_drafts_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_set_drafts" ADD CONSTRAINT "match_set_drafts_arena_id_fkey" FOREIGN KEY ("arena_id") REFERENCES "arenas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_set_drafts" ADD CONSTRAINT "match_set_drafts_map_ban_pool_id_fkey" FOREIGN KEY ("map_ban_pool_id") REFERENCES "map_ban_pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_set_drafts" ADD CONSTRAINT "match_set_drafts_playoff_id_fkey" FOREIGN KEY ("playoff_id") REFERENCES "playoffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_set_drafts" ADD CONSTRAINT "match_set_drafts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_set_drafts" ADD CONSTRAINT "match_set_drafts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_set_drafts" ADD CONSTRAINT "match_set_drafts_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;
