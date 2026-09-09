-- Scope divisions to region + format (same shape as seasons).
-- Existing rows become the 2v2 catalog; every other format gets a clone.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "formats" WHERE "code" = '2v2') THEN
    RAISE EXCEPTION 'Cannot backfill divisions: formats.code = ''2v2'' is required';
  END IF;
END $$;

ALTER TABLE "divisions" ADD COLUMN "format_id" INTEGER;

UPDATE "divisions"
SET "format_id" = (SELECT "id" FROM "formats" WHERE "code" = '2v2' LIMIT 1);

-- Clones share name+region across formats; drop the old unique before inserting.
DROP INDEX IF EXISTS "divisions_name_region_id_key";

INSERT INTO "divisions" ("name", "signup_cost", "hidden", "region_id", "format_id")
SELECT d."name", d."signup_cost", d."hidden", d."region_id", f."id"
FROM "divisions" d
CROSS JOIN "formats" f
WHERE f."code" <> '2v2'
  AND d."format_id" = (SELECT "id" FROM "formats" WHERE "code" = '2v2' LIMIT 1);

INSERT INTO "division_item_payments" ("division_id", "steam_item_id", "item_quantity")
SELECT clone."id", dip."steam_item_id", dip."item_quantity"
FROM "divisions" original
INNER JOIN "division_item_payments" dip ON dip."division_id" = original."id"
INNER JOIN "divisions" clone
  ON clone."name" = original."name"
  AND clone."region_id" = original."region_id"
  AND clone."format_id" <> original."format_id"
WHERE original."format_id" = (SELECT "id" FROM "formats" WHERE "code" = '2v2' LIMIT 1);

UPDATE "teams" t
SET "division_id" = clone."id"
FROM "divisions" original, "divisions" clone
WHERE t."division_id" = original."id"
  AND clone."name" = original."name"
  AND clone."region_id" = original."region_id"
  AND clone."format_id" = t."format_id"
  AND original."format_id" = (SELECT "id" FROM "formats" WHERE "code" = '2v2' LIMIT 1)
  AND t."format_id" <> original."format_id";

UPDATE "staff_assignments" sa
SET "division_id" = clone."id"
FROM "divisions" original, "divisions" clone
WHERE sa."division_id" = original."id"
  AND clone."name" = original."name"
  AND clone."region_id" = original."region_id"
  AND clone."format_id" = sa."format_id"
  AND original."format_id" = (SELECT "id" FROM "formats" WHERE "code" = '2v2' LIMIT 1)
  AND sa."format_id" <> original."format_id";

ALTER TABLE "divisions" ALTER COLUMN "format_id" SET NOT NULL;

CREATE UNIQUE INDEX "divisions_name_region_id_format_id_key" ON "divisions"("name", "region_id", "format_id");
CREATE INDEX "divisions_format_id_idx" ON "divisions"("format_id");

ALTER TABLE "divisions" ADD CONSTRAINT "divisions_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "formats"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
