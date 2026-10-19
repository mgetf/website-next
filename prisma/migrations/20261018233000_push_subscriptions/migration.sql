-- Browsers that opted into operating-system notifications for a Steam account.
CREATE TABLE "push_subscriptions" (
    "id" SERIAL NOT NULL,
    "user_steam_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

CREATE INDEX "push_subscriptions_user_steam_id_idx" ON "push_subscriptions"("user_steam_id");

ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_steam_id_fkey" FOREIGN KEY ("user_steam_id") REFERENCES "users"("steam_id") ON DELETE CASCADE ON UPDATE CASCADE;
