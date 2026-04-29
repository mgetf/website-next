-- Add players column to match_logs
ALTER TABLE "match_logs" ADD COLUMN "players" JSONB NOT NULL DEFAULT '[]';

-- Backfill player names from existing parsedData
UPDATE "match_logs"
SET "players" = (
  SELECT COALESCE(jsonb_agg(p->>'name'), '[]'::jsonb)
  FROM jsonb_array_elements("parsed_data"->'players') AS p
);
