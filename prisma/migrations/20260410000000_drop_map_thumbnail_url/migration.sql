-- AlterTable: drop thumbnail_url column from map_files
ALTER TABLE "map_files" DROP COLUMN IF EXISTS "thumbnail_url";
