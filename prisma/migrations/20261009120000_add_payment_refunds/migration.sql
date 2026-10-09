-- AlterEnum
ALTER TYPE "ItemPaymentStatus" ADD VALUE 'REFUNDED';

-- CreateEnum
CREATE TYPE "PaymentRefundMethod" AS ENUM ('PAYPAL', 'ITEMS');

-- CreateEnum
CREATE TYPE "PaymentRefundStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "trade_offer_url" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "paypal_capture_id" TEXT;

-- CreateTable
CREATE TABLE "payment_refunds" (
    "id" SERIAL NOT NULL,
    "method" "PaymentRefundMethod" NOT NULL,
    "status" "PaymentRefundStatus" NOT NULL DEFAULT 'PENDING',
    "player_steam_id" TEXT NOT NULL,
    "team_id" INTEGER,
    "payment_id" TEXT,
    "item_order_number" TEXT,
    "gross_amount" TEXT,
    "fee_amount" TEXT,
    "refund_amount" TEXT,
    "currency" TEXT,
    "item_name" TEXT,
    "item_app_id" INTEGER,
    "item_market_hash_name" TEXT,
    "item_quantity" INTEGER,
    "paypal_capture_id" TEXT,
    "paypal_refund_id" TEXT,
    "trade_offer_id" TEXT,
    "mark_unpaid" BOOLEAN NOT NULL DEFAULT false,
    "remove_from_team" BOOLEAN NOT NULL DEFAULT false,
    "target_steam_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT NOT NULL,
    "actor_steam_id" TEXT NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_refunds_status_method_idx" ON "payment_refunds"("status", "method");

-- CreateIndex
CREATE INDEX "payment_refunds_player_steam_id_idx" ON "payment_refunds"("player_steam_id");

-- CreateIndex
CREATE INDEX "payment_refunds_payment_id_idx" ON "payment_refunds"("payment_id");

-- CreateIndex
CREATE INDEX "payment_refunds_item_order_number_idx" ON "payment_refunds"("item_order_number");

-- One open or finished refund per source. A FAILED row can be retried.
CREATE UNIQUE INDEX "payment_refunds_paypal_once" ON "payment_refunds"("payment_id") WHERE "method" = 'PAYPAL' AND "status" IN ('PENDING', 'COMPLETED');

CREATE UNIQUE INDEX "payment_refunds_items_once" ON "payment_refunds"("item_order_number") WHERE "method" = 'ITEMS' AND "status" IN ('PENDING', 'COMPLETED');

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_player_steam_id_fkey" FOREIGN KEY ("player_steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_actor_steam_id_fkey" FOREIGN KEY ("actor_steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;
