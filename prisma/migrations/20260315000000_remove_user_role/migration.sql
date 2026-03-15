-- Downgrade all existing USER-role accounts to GUEST
UPDATE "users" SET "permission_level" = 'GUEST' WHERE "permission_level" = 'USER';

-- Recreate the UserRole enum without the USER value
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('GUEST', 'MODERATOR', 'ADMIN');

ALTER TABLE "users"
  ALTER COLUMN "permission_level" DROP DEFAULT,
  ALTER COLUMN "permission_level" TYPE "UserRole"
    USING "permission_level"::text::"UserRole",
  ALTER COLUMN "permission_level" SET DEFAULT 'GUEST';

DROP TYPE "UserRole_old";
