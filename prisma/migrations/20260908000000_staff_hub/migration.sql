-- CreateEnum
CREATE TYPE "StaffSyncStatus" AS ENUM ('OK', 'PENDING', 'ERROR', 'SKIPPED');

-- CreateTable
CREATE TABLE "staff_role_mappings" (
    "id" SERIAL NOT NULL,
    "permission_level" "UserRole" NOT NULL,
    "sourcebans_server_group_id" INTEGER,
    "sourcebans_web_group_id" INTEGER,
    "sourcebans_immunity" INTEGER NOT NULL DEFAULT 0,
    "discord_role_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_role_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_discord_rules" (
    "id" SERIAL NOT NULL,
    "permission_level" "UserRole",
    "format_id" INTEGER,
    "region_id" INTEGER,
    "discord_role_id" TEXT NOT NULL,

    CONSTRAINT "staff_discord_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_sourcebans_servers" (
    "id" SERIAL NOT NULL,
    "region_id" INTEGER NOT NULL,
    "sourcebans_server_id" INTEGER NOT NULL,

    CONSTRAINT "staff_sourcebans_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_sync_states" (
    "steam_id" TEXT NOT NULL,
    "sourcebans_admin_id" INTEGER,
    "sourcebans_status" "StaffSyncStatus" NOT NULL DEFAULT 'PENDING',
    "sourcebans_error" TEXT,
    "discord_status" "StaffSyncStatus" NOT NULL DEFAULT 'PENDING',
    "discord_error" TEXT,
    "last_synced_at" TIMESTAMP(3),

    CONSTRAINT "staff_sync_states_pkey" PRIMARY KEY ("steam_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_role_mappings_permission_level_key" ON "staff_role_mappings"("permission_level");

-- CreateIndex
CREATE INDEX "staff_discord_rules_format_id_idx" ON "staff_discord_rules"("format_id");

-- CreateIndex
CREATE INDEX "staff_discord_rules_region_id_idx" ON "staff_discord_rules"("region_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_sourcebans_servers_region_id_sourcebans_server_id_key" ON "staff_sourcebans_servers"("region_id", "sourcebans_server_id");

-- AddForeignKey
ALTER TABLE "staff_discord_rules" ADD CONSTRAINT "staff_discord_rules_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_discord_rules" ADD CONSTRAINT "staff_discord_rules_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_sourcebans_servers" ADD CONSTRAINT "staff_sourcebans_servers_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_sync_states" ADD CONSTRAINT "staff_sync_states_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "users"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;
