DO $$
BEGIN
    CREATE TYPE "BracketSection" AS ENUM ('MAIN', 'WINNERS', 'LOSERS', 'GRAND_FINAL');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "event_matches"
    ADD COLUMN IF NOT EXISTS "section" "BracketSection",
    ADD COLUMN IF NOT EXISTS "winner_next_match_id" INTEGER,
    ADD COLUMN IF NOT EXISTS "winner_next_side" INTEGER,
    ADD COLUMN IF NOT EXISTS "loser_next_match_id" INTEGER,
    ADD COLUMN IF NOT EXISTS "loser_next_side" INTEGER;

CREATE TABLE IF NOT EXISTS "event_drafts" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER,
    "payload" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "event_revisions" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" TEXT,
    "published_by" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_drafts_event_id_key"
    ON "event_drafts"("event_id");
CREATE UNIQUE INDEX IF NOT EXISTS "event_revisions_event_id_revision_key"
    ON "event_revisions"("event_id", "revision");
CREATE INDEX IF NOT EXISTS "event_revisions_event_id_idx"
    ON "event_revisions"("event_id");
CREATE INDEX IF NOT EXISTS "event_matches_winner_next_match_id_idx"
    ON "event_matches"("winner_next_match_id");
CREATE INDEX IF NOT EXISTS "event_matches_loser_next_match_id_idx"
    ON "event_matches"("loser_next_match_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'event_matches_winner_next_match_id_fkey'
    ) THEN
        ALTER TABLE "event_matches"
            ADD CONSTRAINT "event_matches_winner_next_match_id_fkey"
            FOREIGN KEY ("winner_next_match_id") REFERENCES "event_matches"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'event_matches_loser_next_match_id_fkey'
    ) THEN
        ALTER TABLE "event_matches"
            ADD CONSTRAINT "event_matches_loser_next_match_id_fkey"
            FOREIGN KEY ("loser_next_match_id") REFERENCES "event_matches"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'event_drafts_event_id_fkey'
    ) THEN
        ALTER TABLE "event_drafts"
            ADD CONSTRAINT "event_drafts_event_id_fkey"
            FOREIGN KEY ("event_id") REFERENCES "events"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'event_drafts_created_by_fkey'
    ) THEN
        ALTER TABLE "event_drafts"
            ADD CONSTRAINT "event_drafts_created_by_fkey"
            FOREIGN KEY ("created_by") REFERENCES "users"("steam_id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'event_drafts_updated_by_fkey'
    ) THEN
        ALTER TABLE "event_drafts"
            ADD CONSTRAINT "event_drafts_updated_by_fkey"
            FOREIGN KEY ("updated_by") REFERENCES "users"("steam_id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'event_revisions_event_id_fkey'
    ) THEN
        ALTER TABLE "event_revisions"
            ADD CONSTRAINT "event_revisions_event_id_fkey"
            FOREIGN KEY ("event_id") REFERENCES "events"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'event_revisions_published_by_fkey'
    ) THEN
        ALTER TABLE "event_revisions"
            ADD CONSTRAINT "event_revisions_published_by_fkey"
            FOREIGN KEY ("published_by") REFERENCES "users"("steam_id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
