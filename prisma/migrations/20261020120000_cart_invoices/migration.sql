-- Cart, participation holds, grouped item orders, and invoices.

CREATE TYPE "InvoiceKind" AS ENUM ('LINE', 'GROUP', 'CREDIT_NOTE');
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'REFUNDED');

ALTER TABLE "item_payment_orders" ADD COLUMN "checkout_group_id" TEXT;
CREATE INDEX "item_payment_orders_checkout_group_id_idx" ON "item_payment_orders"("checkout_group_id");

CREATE TABLE "carts" (
    "id" SERIAL NOT NULL,
    "steam_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "carts_steam_id_key" ON "carts"("steam_id");

CREATE TABLE "cart_lines" (
    "id" SERIAL NOT NULL,
    "cart_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "player_steam_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cart_lines_cart_id_team_id_player_steam_id_key" ON "cart_lines"("cart_id", "team_id", "player_steam_id");
CREATE INDEX "cart_lines_player_steam_id_team_id_idx" ON "cart_lines"("player_steam_id", "team_id");

CREATE TABLE "cart_reservations" (
    "id" SERIAL NOT NULL,
    "payer_steam_id" TEXT NOT NULL,
    "team_id" INTEGER NOT NULL,
    "player_steam_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cart_reservations_team_id_player_steam_id_key" ON "cart_reservations"("team_id", "player_steam_id");
CREATE INDEX "cart_reservations_payer_steam_id_idx" ON "cart_reservations"("payer_steam_id");
CREATE INDEX "cart_reservations_expires_at_idx" ON "cart_reservations"("expires_at");

CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "payment_id" TEXT,
    "group_key" TEXT,
    "credit_for_number" TEXT,
    "payer_steam_id" TEXT NOT NULL,
    "covered_steam_id" TEXT,
    "team_id" INTEGER,
    "snapshot" JSONB NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refunded_at" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");
CREATE INDEX "invoices_payer_steam_id_idx" ON "invoices"("payer_steam_id");
CREATE INDEX "invoices_covered_steam_id_idx" ON "invoices"("covered_steam_id");
CREATE INDEX "invoices_group_key_idx" ON "invoices"("group_key");
CREATE INDEX "invoices_payment_id_idx" ON "invoices"("payment_id");

CREATE INDEX "payments_purchased_for_idx" ON "payments"("purchased_for");
CREATE INDEX "payments_paypal_capture_id_idx" ON "payments"("paypal_capture_id");

ALTER TABLE "carts" ADD CONSTRAINT "carts_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_player_steam_id_fkey" FOREIGN KEY ("player_steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cart_reservations" ADD CONSTRAINT "cart_reservations_payer_steam_id_fkey" FOREIGN KEY ("payer_steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cart_reservations" ADD CONSTRAINT "cart_reservations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_reservations" ADD CONSTRAINT "cart_reservations_player_steam_id_fkey" FOREIGN KEY ("player_steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("payment_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payer_steam_id_fkey" FOREIGN KEY ("payer_steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_covered_steam_id_fkey" FOREIGN KEY ("covered_steam_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
