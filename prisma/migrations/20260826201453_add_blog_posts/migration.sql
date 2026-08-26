-- DropForeignKey
ALTER TABLE "event_participants" DROP CONSTRAINT "event_participants_steam_id_fkey";

-- DropForeignKey
ALTER TABLE "event_placements" DROP CONSTRAINT "event_placements_steam_id_fkey";

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_placements" ADD CONSTRAINT "event_placements_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;
