-- AlterTable
ALTER TABLE "formats" ADD COLUMN "is_individual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "formats" ADD COLUMN "min_roster_size" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "formats" ADD COLUMN "max_roster_size" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "formats" ADD COLUMN "required_paid_players" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "formats" ADD COLUMN "supports_join_password" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "formats" ADD COLUMN "supports_acronym" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "formats" ADD COLUMN "supports_reregistration" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "formats" ADD COLUMN "theme_key" TEXT NOT NULL DEFAULT 'primary';

-- Seed behavior for existing formats
UPDATE "formats"
SET
  "is_individual" = true,
  "min_roster_size" = 1,
  "max_roster_size" = 1,
  "required_paid_players" = 1,
  "supports_join_password" = false,
  "supports_acronym" = false,
  "supports_reregistration" = false,
  "theme_key" = 'purple'
WHERE "code" = '1v1';

UPDATE "formats"
SET
  "is_individual" = false,
  "min_roster_size" = 2,
  "max_roster_size" = 3,
  "required_paid_players" = 2,
  "supports_join_password" = true,
  "supports_acronym" = true,
  "supports_reregistration" = true,
  "theme_key" = 'blue'
WHERE "code" = '2v2';

-- New team formats (same defaults as 2v2)
INSERT INTO "formats" (
  "name",
  "code",
  "is_individual",
  "min_roster_size",
  "max_roster_size",
  "required_paid_players",
  "supports_join_password",
  "supports_acronym",
  "supports_reregistration",
  "theme_key"
)
VALUES
  ('Ultiduo', 'ultiduo', false, 2, 3, 2, true, true, true, 'primary'),
  ('BBall', 'bball', false, 2, 3, 2, true, true, true, 'primary')
ON CONFLICT ("code") DO NOTHING;
