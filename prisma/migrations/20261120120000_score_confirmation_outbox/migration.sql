-- Playoff score confirmation and the Discord outbox.

CREATE TYPE "ScoreSubmissionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISPUTED', 'SUPERSEDED');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'CLAIMED', 'DELIVERED', 'DEAD');

CREATE TABLE "match_score_submissions" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "submitted_by" TEXT NOT NULL,
    "submitted_by_team_id" INTEGER NOT NULL,
    "game_results" JSONB NOT NULL,
    "status" "ScoreSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auto_confirm_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "auto_confirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "match_score_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "match_score_submissions_match_id_status_idx" ON "match_score_submissions"("match_id", "status");
CREATE INDEX "match_score_submissions_status_auto_confirm_at_idx" ON "match_score_submissions"("status", "auto_confirm_at");
-- At most one open report per match.
CREATE UNIQUE INDEX "match_score_submissions_one_pending_per_match" ON "match_score_submissions"("match_id") WHERE "status" = 'PENDING';

ALTER TABLE "match_score_submissions"
  ADD CONSTRAINT "match_score_submissions_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "outbox_events" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outbox_events_dedupe_key_key" ON "outbox_events"("dedupe_key");
CREATE INDEX "outbox_events_status_next_attempt_at_idx" ON "outbox_events"("status", "next_attempt_at");
