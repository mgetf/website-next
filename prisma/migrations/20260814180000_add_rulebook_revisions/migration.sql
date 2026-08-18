-- CreateTable
CREATE TABLE "rulebook_revisions" (
    "id" SERIAL NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" TEXT,

    CONSTRAINT "rulebook_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rulebook_revisions_version_key" ON "rulebook_revisions"("version");

-- CreateIndex
CREATE INDEX "rulebook_revisions_published_at_idx" ON "rulebook_revisions"("published_at");

-- AddForeignKey
ALTER TABLE "rulebook_revisions" ADD CONSTRAINT "rulebook_revisions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill the current live rulebook as revision 1
INSERT INTO "rulebook_revisions" ("version", "content", "message", "published_at", "published_by")
SELECT
    1,
    sc."content",
    'Imported existing rulebook',
    sc."updated_at",
    CASE
        WHEN EXISTS (
            SELECT 1 FROM "users" u WHERE u."steam_id" = sc."updated_by"
        ) THEN sc."updated_by"
        ELSE NULL
    END
FROM "site_content" sc
WHERE sc."key" = 'rulebook';
