-- Promote implicit User↔Division M2M into an explicit staff_assignments table with format_id.

CREATE TABLE "staff_assignments" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "format_id" INTEGER NOT NULL,
    "division_id" INTEGER NOT NULL,

    CONSTRAINT "staff_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_assignments_user_id_format_id_division_id_key" ON "staff_assignments"("user_id", "format_id", "division_id");
CREATE INDEX "staff_assignments_format_id_idx" ON "staff_assignments"("format_id");
CREATE INDEX "staff_assignments_division_id_idx" ON "staff_assignments"("division_id");

ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Expand each existing assignment to one row per format that already has a season in that division's region.
INSERT INTO "staff_assignments" ("user_id", "format_id", "division_id")
SELECT DISTINCT sa."B", s."format_id", sa."A"
FROM "_StaffAssignments" sa
INNER JOIN "divisions" d ON d."id" = sa."A"
INNER JOIN "seasons" s ON s."region_id" = d."region_id";

DROP TABLE "_StaffAssignments";
