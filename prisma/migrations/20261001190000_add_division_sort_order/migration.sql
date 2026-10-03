-- Arbitrary display order per region + format catalog.
-- Backfill from current public order (higher id first).

ALTER TABLE "divisions" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    id,
    (ROW_NUMBER() OVER (PARTITION BY region_id, format_id ORDER BY id DESC) - 1)::integer AS sort_order
  FROM "divisions"
)
UPDATE "divisions" AS d
SET "sort_order" = ranked.sort_order
FROM ranked
WHERE d.id = ranked.id;

CREATE INDEX "divisions_region_id_format_id_sort_order_idx"
  ON "divisions" ("region_id", "format_id", "sort_order");
