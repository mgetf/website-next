-- Add standings_visible_statuses column to global table
-- Controls which team statuses are shown in league standings pages
ALTER TABLE "global" ADD COLUMN "standings_visible_statuses" TEXT[] NOT NULL DEFAULT ARRAY['READY', 'PENDING'];
