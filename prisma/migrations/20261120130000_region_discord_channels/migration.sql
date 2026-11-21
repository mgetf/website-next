-- Per-region Discord channels for playoff posts and staff alerts.
ALTER TABLE "regions" ADD COLUMN "discord_playoffs_channel_id" TEXT;
ALTER TABLE "regions" ADD COLUMN "discord_staff_channel_id" TEXT;
