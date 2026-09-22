-- Drop stored file sizes; catalog entries now point at external URLs.
DELETE FROM "map_files";

ALTER TABLE "map_files" DROP COLUMN "bsp_size",
DROP COLUMN "cfg_size";
