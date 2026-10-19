-- Staff assignments are scoped to a region. Format and division become optional
-- (null = every format / every division in that region).

ALTER TABLE "staff_assignments" ADD COLUMN "region_id" INTEGER;

UPDATE "staff_assignments" AS sa
SET "region_id" = d."region_id"
FROM "divisions" AS d
WHERE d."id" = sa."division_id";

ALTER TABLE "staff_assignments" ALTER COLUMN "region_id" SET NOT NULL;

ALTER TABLE "staff_assignments" ALTER COLUMN "format_id" DROP NOT NULL;
ALTER TABLE "staff_assignments" ALTER COLUMN "division_id" DROP NOT NULL;

DROP INDEX "staff_assignments_user_id_format_id_division_id_key";

CREATE UNIQUE INDEX "staff_assignments_user_id_region_id_format_id_division_id_key"
ON "staff_assignments"("user_id", "region_id", "format_id", "division_id")
NULLS NOT DISTINCT;

CREATE INDEX "staff_assignments_region_id_idx" ON "staff_assignments"("region_id");

ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_region_id_fkey"
FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
