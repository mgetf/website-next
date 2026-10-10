-- CreateEnum
CREATE TYPE "MatchSetDraftKind" AS ENUM ('SET', 'SINGLE');

-- AlterTable
ALTER TABLE "match_set_drafts" ADD COLUMN "kind" "MatchSetDraftKind" NOT NULL DEFAULT 'SET';
