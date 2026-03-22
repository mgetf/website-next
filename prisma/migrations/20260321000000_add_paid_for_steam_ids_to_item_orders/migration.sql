-- AlterTable
ALTER TABLE "item_payment_orders" ADD COLUMN "paid_for_steam_ids" TEXT[] NOT NULL DEFAULT '{}';
