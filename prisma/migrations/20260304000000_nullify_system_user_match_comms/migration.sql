-- Set owner to NULL for all match comms previously attributed to the hardcoded system Steam account.
-- This account was used as a fake player to post automated "Match Created!" messages.
UPDATE "match_comms" SET "owner" = NULL WHERE "owner" = '76561199005229176';
