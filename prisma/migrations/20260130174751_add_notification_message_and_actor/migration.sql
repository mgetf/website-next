-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "actor_steam_id" TEXT,
ADD COLUMN     "message" TEXT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_steam_id_fkey" FOREIGN KEY ("actor_steam_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;
