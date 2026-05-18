-- Add denormalized preview column to match_logs so the public listing
-- query no longer has to pull the full parsed_data JSON blob per row.
ALTER TABLE "match_logs" ADD COLUMN "preview" JSONB;

-- Backfill preview for existing non-aborted matches that have at least
-- one winner and one loser. Mirrors the buildPreview() logic in
-- src/lib/server/services/matchLogs.ts.
UPDATE "match_logs"
SET "preview" = jsonb_build_object(
  'winner', jsonb_build_object(
    'names', (
      SELECT jsonb_agg(p->>'name')
      FROM jsonb_array_elements("parsed_data"->'players') AS p
      WHERE (p->>'won')::boolean = true
    ),
    'classes', (
      SELECT jsonb_agg(p->>'startClass')
      FROM jsonb_array_elements("parsed_data"->'players') AS p
      WHERE (p->>'won')::boolean = true
    ),
    'score', (
      SELECT MAX((p->>'score')::int)
      FROM jsonb_array_elements("parsed_data"->'players') AS p
      WHERE (p->>'won')::boolean = true
    ),
    'team', (
      SELECT p->>'team'
      FROM jsonb_array_elements("parsed_data"->'players') AS p
      WHERE (p->>'won')::boolean = true
      LIMIT 1
    )
  ),
  'loser', jsonb_build_object(
    'names', (
      SELECT jsonb_agg(p->>'name')
      FROM jsonb_array_elements("parsed_data"->'players') AS p
      WHERE (p->>'won')::boolean = false
    ),
    'classes', (
      SELECT jsonb_agg(p->>'startClass')
      FROM jsonb_array_elements("parsed_data"->'players') AS p
      WHERE (p->>'won')::boolean = false
    ),
    'score', (
      SELECT MAX((p->>'score')::int)
      FROM jsonb_array_elements("parsed_data"->'players') AS p
      WHERE (p->>'won')::boolean = false
    ),
    'team', (
      SELECT p->>'team'
      FROM jsonb_array_elements("parsed_data"->'players') AS p
      WHERE (p->>'won')::boolean = false
      LIMIT 1
    )
  )
)
WHERE "aborted" = false
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("parsed_data"->'players') AS p
    WHERE (p->>'won')::boolean = true
  )
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("parsed_data"->'players') AS p
    WHERE (p->>'won')::boolean = false
  );

-- Index to support the ORDER BY uploaded_at DESC + LIMIT pattern used by
-- listMatchLogs() without a sequential scan.
CREATE INDEX "match_logs_uploaded_at_idx" ON "match_logs" ("uploaded_at" DESC);
