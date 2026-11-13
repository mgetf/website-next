-- Mod-only staff notes ("flags") on players.

CREATE TABLE "player_flags" (
    "id" SERIAL NOT NULL,
    "player_steam_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,

    CONSTRAINT "player_flags_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "player_flags" ADD CONSTRAINT "player_flags_player_steam_id_fkey" FOREIGN KEY ("player_steam_id") REFERENCES "users"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_flags" ADD CONSTRAINT "player_flags_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "player_flags" ADD CONSTRAINT "player_flags_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "player_flags_player_steam_id_idx" ON "player_flags"("player_steam_id");
CREATE INDEX "player_flags_resolved_at_idx" ON "player_flags"("resolved_at");
