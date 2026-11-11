-- Private forfeit reason + evidence (LLM judgement + ticket channel link).
-- Both are stripped server-side for viewers outside the match / staff.

ALTER TABLE "matches" ADD COLUMN "forfeit_reason" TEXT;
ALTER TABLE "matches" ADD COLUMN "forfeit_evidence" TEXT;
