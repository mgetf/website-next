-- Mod-approved forfeit handling (single FF + mutual-FF void) with ticket reference.

CREATE TYPE "ForfeitType" AS ENUM ('NONE', 'SINGLE', 'MUTUAL');

ALTER TABLE "matches" ADD COLUMN "forfeit_type" "ForfeitType" NOT NULL DEFAULT 'NONE';
ALTER TABLE "matches" ADD COLUMN "forfeit_winner_id" INTEGER;
ALTER TABLE "matches" ADD COLUMN "forfeit_ticket_ref" TEXT;
ALTER TABLE "matches" ADD COLUMN "forfeit_approved_by" TEXT;
ALTER TABLE "matches" ADD COLUMN "forfeit_approved_at" TIMESTAMP(3);

ALTER TABLE "matches" ADD CONSTRAINT "matches_forfeit_winner_id_fkey"
  FOREIGN KEY ("forfeit_winner_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "matches_forfeit_type_idx" ON "matches"("forfeit_type");
