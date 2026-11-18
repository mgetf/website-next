-- Per-match division filing (matches must not depend on a team's
-- *current* division, which can shuffle mid-season).
ALTER TABLE "matches" ADD COLUMN "division_id" INTEGER;

ALTER TABLE "matches" ADD CONSTRAINT "matches_division_id_fkey"
  FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "matches_division_id_idx" ON "matches"("division_id");

-- Historical rows predate the column: file them under the home team's
-- current division, matching the previous API derivation. New rows
-- capture the division explicitly at scheduling time.
UPDATE "matches" SET "division_id" = t."division_id"
FROM "teams" t
WHERE "matches"."home_team_id" = t."id"
  AND "matches"."division_id" IS NULL
  AND "matches"."home_team_id" <> 0;
