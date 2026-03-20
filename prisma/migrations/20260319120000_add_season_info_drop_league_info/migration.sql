-- Add info field to seasons table
ALTER TABLE "seasons" ADD COLUMN "info" TEXT;

-- Drop unused league_info table
DROP TABLE "league_info";
