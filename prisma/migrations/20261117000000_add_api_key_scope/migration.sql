-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM ('READ', 'WRITE');

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN "scope" "ApiKeyScope" NOT NULL DEFAULT 'WRITE';
