-- Convert timestamp fields from various formats to proper TIMESTAMP type

-- 1. PlayerInTeam.leftAt: String (mixed Unix seconds / ISO strings / "0") -> TIMESTAMP
-- First add a new column, convert data, then swap
-- For numeric strings: only convert if >= 946684800 (Jan 1, 2000) as valid timestamp
ALTER TABLE "players_in_teams" ADD COLUMN "left_at_new" TIMESTAMP;

UPDATE "players_in_teams" SET "left_at_new" = 
  CASE 
    WHEN "left_at" IS NULL OR "left_at" = '0' OR "left_at" = '' THEN NULL
    WHEN "left_at" ~ '^\d+$' AND "left_at"::bigint >= 946684800 THEN to_timestamp("left_at"::bigint)
    WHEN "left_at" ~ '^\d+$' THEN NULL  -- Invalid numeric timestamp (before year 2000)
    ELSE "left_at"::timestamp  -- ISO string format
  END;

ALTER TABLE "players_in_teams" DROP COLUMN "left_at";
ALTER TABLE "players_in_teams" RENAME COLUMN "left_at_new" TO "left_at";

-- 2. Match.submittedAt: Int (Unix seconds) -> TIMESTAMP
-- Only convert values >= 946684800 (Jan 1, 2000) as valid timestamps
-- Values below this threshold are invalid data and should be NULL
ALTER TABLE "matches" ADD COLUMN "submitted_at_new" TIMESTAMP;

UPDATE "matches" SET "submitted_at_new" = 
  CASE 
    WHEN "submitted_at" IS NULL OR "submitted_at" < 946684800 THEN NULL
    ELSE to_timestamp("submitted_at")
  END;

ALTER TABLE "matches" DROP COLUMN "submitted_at";
ALTER TABLE "matches" RENAME COLUMN "submitted_at_new" TO "submitted_at";

-- 3. MatchComm.createdAt: Int (Unix seconds) -> TIMESTAMP
-- Note: column is named "created_At" with capital A in DB, renaming to "created_at"
-- Only convert values >= 946684800 (Jan 1, 2000) as valid timestamps
ALTER TABLE "match_comms" ADD COLUMN "created_at_new" TIMESTAMP;

UPDATE "match_comms" SET "created_at_new" = 
  CASE 
    WHEN "created_At" IS NULL OR "created_At" < 946684800 THEN NULL
    ELSE to_timestamp("created_At")
  END;

ALTER TABLE "match_comms" DROP COLUMN "created_At";
ALTER TABLE "match_comms" RENAME COLUMN "created_at_new" TO "created_at";

-- 4. Punishment.startDateTime: Int (Unix seconds) -> TIMESTAMP
-- Only convert values >= 946684800 (Jan 1, 2000) as valid timestamps
ALTER TABLE "punishment" ADD COLUMN "start_date_time_new" TIMESTAMP;

UPDATE "punishment" SET "start_date_time_new" = 
  CASE 
    WHEN "start_date_time" IS NULL OR "start_date_time" < 946684800 THEN NULL
    ELSE to_timestamp("start_date_time")
  END;

ALTER TABLE "punishment" DROP COLUMN "start_date_time";
ALTER TABLE "punishment" RENAME COLUMN "start_date_time_new" TO "start_date_time";

-- 5. Payment.purchaseDate: String (ISO format) -> TIMESTAMP
ALTER TABLE "payments" ADD COLUMN "purchase_date_new" TIMESTAMP;

UPDATE "payments" SET "purchase_date_new" = "purchase_date"::timestamp;

ALTER TABLE "payments" DROP COLUMN "purchase_date";
ALTER TABLE "payments" RENAME COLUMN "purchase_date_new" TO "purchase_date";

-- Make purchase_date NOT NULL (it was required before)
ALTER TABLE "payments" ALTER COLUMN "purchase_date" SET NOT NULL;

