-- Migration: Remove shared divisions, require region per division
-- 
-- This migration handles the transition from "shared" divisions (NULL region_id)
-- to region-specific divisions. For each shared division, we:
-- 1. Assign the original division to the first region (NA)
-- 2. Create copies of the division for other regions that have teams using it
-- 3. Reassign teams to the appropriate region-specific division

-- Step 1: Create region-specific divisions for teams that would be orphaned
-- For each shared division, create a copy for each region that has teams in it
DO $$
DECLARE
    div_record RECORD;
    region_record RECORD;
    new_div_id INT;
    team_count INT;
BEGIN
    -- For each division with NULL region_id
    FOR div_record IN 
        SELECT id, name, signup_cost, hidden 
        FROM divisions 
        WHERE region_id IS NULL
    LOOP
        -- For each region (except the first one which will keep the original)
        FOR region_record IN 
            SELECT id, name FROM regions WHERE id > (SELECT MIN(id) FROM regions)
        LOOP
            -- Check if there are teams in this region using this division
            SELECT COUNT(*) INTO team_count
            FROM teams
            WHERE division_id = div_record.id AND region_id = region_record.id;
            
            IF team_count > 0 THEN
                -- Create a new division for this region
                INSERT INTO divisions (name, signup_cost, hidden, region_id)
                VALUES (div_record.name, div_record.signup_cost, div_record.hidden, region_record.id)
                RETURNING id INTO new_div_id;
                
                -- Update teams to use the new division
                UPDATE teams
                SET division_id = new_div_id
                WHERE division_id = div_record.id AND region_id = region_record.id;
                
                RAISE NOTICE 'Created division % for region % (ID: %), moved % teams', 
                    div_record.name, region_record.name, new_div_id, team_count;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- Step 2: Assign remaining shared divisions to the first region
UPDATE "divisions" 
SET "region_id" = (SELECT MIN(id) FROM "regions")
WHERE "region_id" IS NULL;

-- Step 3: Make the column required (NOT NULL)
ALTER TABLE "divisions" ALTER COLUMN "region_id" SET NOT NULL;

-- Step 4: Add unique constraint on (name, region_id)
-- This allows same division names in different regions with different pricing
CREATE UNIQUE INDEX "divisions_name_region_id_key" ON "divisions"("name", "region_id");

