-- 2v2 MGE: every roster slot must pay (still capped to current roster size in app code).
-- Ultiduo / BBall stay at 2 because those formats are free.
UPDATE "formats"
SET "required_paid_players" = 3
WHERE "code" = '2v2';
