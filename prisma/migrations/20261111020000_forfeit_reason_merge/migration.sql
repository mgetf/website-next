-- Merge reason + evidence into a single private forfeit_reason field.

ALTER TABLE "matches" DROP COLUMN "forfeit_evidence";
ALTER TABLE "matches" ALTER COLUMN "forfeit_reason" TYPE TEXT;
