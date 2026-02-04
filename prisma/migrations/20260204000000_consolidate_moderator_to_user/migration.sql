-- Step 1: Add staff_division_id column to users table
ALTER TABLE "users" ADD COLUMN "staff_division_id" INTEGER;

-- Step 2: Migrate data from moderators table to users table
UPDATE "users" 
SET "staff_division_id" = m."division_id"
FROM "moderators" m 
WHERE "users"."steam_id" = m."steam_id";

-- Step 3: Add foreign key constraint
ALTER TABLE "users" ADD CONSTRAINT "users_staff_division_id_fkey" 
FOREIGN KEY ("staff_division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 4: Drop the moderators table
DROP TABLE "moderators";
