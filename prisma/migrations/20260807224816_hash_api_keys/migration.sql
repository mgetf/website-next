-- Hash API keys at rest. Plaintext secrets are removed after backfill.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "api_keys" ADD COLUMN "key_hash" TEXT;
ALTER TABLE "api_keys" ADD COLUMN "key_prefix" TEXT;

UPDATE "api_keys"
SET
  "key_hash" = encode(digest("key", 'sha256'), 'hex'),
  "key_prefix" = CASE
    WHEN "key" LIKE 'mge_%' AND length("key") >= 8 THEN substring("key" from 1 for 8)
    ELSE 'mge_????'
  END;

ALTER TABLE "api_keys" ALTER COLUMN "key_hash" SET NOT NULL;
ALTER TABLE "api_keys" ALTER COLUMN "key_prefix" SET NOT NULL;

CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_key_key";
DROP INDEX IF EXISTS "api_keys_key_key";
ALTER TABLE "api_keys" DROP COLUMN "key";
