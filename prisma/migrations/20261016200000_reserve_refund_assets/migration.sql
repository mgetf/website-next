-- Pin specific Steam asset ids to a pending item refund so two refunds
-- cannot spend the same keys while one offer is still waiting to be sent.
ALTER TABLE "payment_refunds" ADD COLUMN "reserved_asset_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
