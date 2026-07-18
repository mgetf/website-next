ALTER TABLE "event_participants"
    ADD COLUMN IF NOT EXISTS "display_name" TEXT;

UPDATE "event_participants" AS participant
SET "display_name" = COALESCE(
    participant."display_name",
    "users"."steam_username",
    participant."steam_id"
)
FROM "users"
WHERE participant."steam_id" = "users"."steam_id"
  AND participant."display_name" IS NULL;

UPDATE "event_participants"
SET "display_name" = COALESCE("display_name", "steam_id", 'Unknown participant')
WHERE "display_name" IS NULL;

ALTER TABLE "event_participants"
    ALTER COLUMN "display_name" SET NOT NULL,
    ALTER COLUMN "steam_id" DROP NOT NULL;

ALTER TABLE "event_placements"
    ADD COLUMN IF NOT EXISTS "display_name" TEXT;

UPDATE "event_placements" AS placement
SET "display_name" = COALESCE(
    placement."display_name",
    "users"."steam_username",
    placement."steam_id"
)
FROM "users"
WHERE placement."steam_id" = "users"."steam_id"
  AND placement."display_name" IS NULL;

UPDATE "event_placements"
SET "display_name" = COALESCE("display_name", "steam_id", 'Unknown participant')
WHERE "display_name" IS NULL;

ALTER TABLE "event_placements"
    ALTER COLUMN "display_name" SET NOT NULL,
    ALTER COLUMN "steam_id" DROP NOT NULL;
