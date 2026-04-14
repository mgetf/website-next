-- DropForeignKey
ALTER TABLE "event_match_players" DROP CONSTRAINT "event_match_players_steam_id_fkey";

-- AlterTable
ALTER TABLE "_StaffAssignments" ADD CONSTRAINT "_StaffAssignments_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_StaffAssignments_AB_unique";

-- AlterTable
ALTER TABLE "item_payment_orders" ADD COLUMN     "checkout_teams" TEXT;

-- AddForeignKey
ALTER TABLE "event_match_players" ADD CONSTRAINT "event_match_players_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;
