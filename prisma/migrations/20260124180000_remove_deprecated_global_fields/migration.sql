-- Remove deprecated global settings fields
-- These settings have been moved to per-season configuration in the Season model

ALTER TABLE "global" DROP COLUMN IF EXISTS "signup_closed";
ALTER TABLE "global" DROP COLUMN IF EXISTS "roster_locked";
ALTER TABLE "global" DROP COLUMN IF EXISTS "payment_required";
ALTER TABLE "global" DROP COLUMN IF EXISTS "match_creation_deadline";
ALTER TABLE "global" DROP COLUMN IF EXISTS "current_match_week";
