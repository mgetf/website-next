-- CreateEnum
CREATE TYPE "ItemPaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "global" ADD COLUMN "bot_steam_id" TEXT,
ADD COLUMN "bot_trade_offer_url" TEXT;

-- CreateTable
CREATE TABLE "steam_items" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "app_id" INTEGER NOT NULL,
    "market_hash_name" TEXT NOT NULL,
    "icon_url" TEXT,

    CONSTRAINT "steam_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "division_item_payments" (
    "id" SERIAL NOT NULL,
    "division_id" INTEGER NOT NULL,
    "steam_item_id" INTEGER NOT NULL,
    "item_quantity" INTEGER NOT NULL,

    CONSTRAINT "division_item_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_payment_orders" (
    "id" SERIAL NOT NULL,
    "order_number" TEXT NOT NULL,
    "player_steam_id" TEXT NOT NULL,
    "team_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "item_name" TEXT NOT NULL,
    "item_app_id" INTEGER NOT NULL,
    "item_market_hash_name" TEXT NOT NULL,
    "items_required" INTEGER NOT NULL,
    "items_received" INTEGER NOT NULL DEFAULT 0,
    "status" "ItemPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "trade_offer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "steam_items_market_hash_name_key" ON "steam_items"("market_hash_name");

-- CreateIndex
CREATE UNIQUE INDEX "division_item_payments_division_id_key" ON "division_item_payments"("division_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_payment_orders_order_number_key" ON "item_payment_orders"("order_number");

-- CreateIndex
CREATE INDEX "item_payment_orders_player_steam_id_status_idx" ON "item_payment_orders"("player_steam_id", "status");

-- AddForeignKey
ALTER TABLE "division_item_payments" ADD CONSTRAINT "division_item_payments_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "division_item_payments" ADD CONSTRAINT "division_item_payments_steam_item_id_fkey" FOREIGN KEY ("steam_item_id") REFERENCES "steam_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_payment_orders" ADD CONSTRAINT "item_payment_orders_player_steam_id_fkey" FOREIGN KEY ("player_steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_payment_orders" ADD CONSTRAINT "item_payment_orders_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_payment_orders" ADD CONSTRAINT "item_payment_orders_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: Pre-populate Steam Items catalog with common TF2 items
INSERT INTO "steam_items" ("name", "app_id", "market_hash_name") VALUES
    ('Mann Co. Supply Crate Key', 440, 'Mann Co. Supply Crate Key'),
    ('Refined Metal', 440, 'Refined Metal');
