-- CreateTable: implicit M2M join table for User <-> Division staff assignments
CREATE TABLE "_StaffAssignments" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_StaffAssignments_AB_unique" ON "_StaffAssignments"("A", "B");
CREATE INDEX "_StaffAssignments_B_index" ON "_StaffAssignments"("B");

-- AddForeignKey
ALTER TABLE "_StaffAssignments" ADD CONSTRAINT "_StaffAssignments_A_fkey" FOREIGN KEY ("A") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_StaffAssignments" ADD CONSTRAINT "_StaffAssignments_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing staff_division_id data into the join table
INSERT INTO "_StaffAssignments" ("A", "B")
SELECT "staff_division_id", "steam_id"
FROM "users"
WHERE "staff_division_id" IS NOT NULL;

-- Drop the old column
ALTER TABLE "users" DROP COLUMN "staff_division_id";
