-- Replies to the bot's DMs, the bot's heartbeat, and a link from an outbox event to the Discord message it sent.

ALTER TABLE "outbox_events" ADD COLUMN "discord_message_id" TEXT;
CREATE INDEX "outbox_events_discord_message_id_idx" ON "outbox_events"("discord_message_id");

CREATE TABLE "bot_status" (
    "id" INTEGER NOT NULL,
    "last_poll_at" TIMESTAMP(3) NOT NULL,
    "last_poll_events" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bot_status_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "discord_inbox_messages" (
    "id" SERIAL NOT NULL,
    "discord_message_id" TEXT NOT NULL,
    "discord_user_id" TEXT NOT NULL,
    "discord_username" TEXT NOT NULL,
    "steam_id" TEXT,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "reply_to_message_id" TEXT,
    "outbox_event_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handled_at" TIMESTAMP(3),
    "handled_by" TEXT,

    CONSTRAINT "discord_inbox_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discord_inbox_messages_discord_message_id_key" ON "discord_inbox_messages"("discord_message_id");
CREATE INDEX "discord_inbox_messages_handled_at_created_at_idx" ON "discord_inbox_messages"("handled_at", "created_at");
CREATE INDEX "discord_inbox_messages_discord_user_id_idx" ON "discord_inbox_messages"("discord_user_id");
