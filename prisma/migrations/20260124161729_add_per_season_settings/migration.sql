-- DropForeignKey
ALTER TABLE "divisions" DROP CONSTRAINT "divisions_region_id_fkey";

-- AlterTable
ALTER TABLE "match_comms" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "matches" ALTER COLUMN "submitted_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "purchase_date" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "players_in_teams" ALTER COLUMN "left_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "punishment" ALTER COLUMN "start_date_time" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "seasons" ADD COLUMN     "match_deadline" TIMESTAMP(3),
ADD COLUMN     "match_week" INTEGER,
ADD COLUMN     "payment_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "roster_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "signups_open" BOOLEAN NOT NULL DEFAULT false;

-- Data Migration: Copy global settings to all existing seasons
-- signups_open is inverted from signup_closed (0 means open, so NOT signup_closed = 1 means open)
UPDATE "seasons" s
SET 
    signups_open = CASE WHEN g.signup_closed = 0 THEN true ELSE false END,
    roster_locked = CASE WHEN g.roster_locked = 1 THEN true ELSE false END,
    payment_required = CASE WHEN g.payment_required = 1 THEN true ELSE false END,
    match_week = g.current_match_week,
    match_deadline = g.match_creation_deadline
FROM "global" g
WHERE g.id = 1;

-- AddForeignKey
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
