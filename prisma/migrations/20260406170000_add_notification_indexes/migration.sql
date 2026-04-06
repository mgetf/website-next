-- Improve notification query performance for SSE polling and dropdown queries.
CREATE INDEX IF NOT EXISTS "notifications_user_steam_id_id_idx"
ON "notifications"("user_steam_id", "id");

CREATE INDEX IF NOT EXISTS "notifications_user_steam_id_created_at_idx"
ON "notifications"("user_steam_id", "created_at");

CREATE INDEX IF NOT EXISTS "notifications_user_steam_id_is_read_created_at_idx"
ON "notifications"("user_steam_id", "is_read", "created_at");
