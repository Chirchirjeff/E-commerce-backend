-- Add delivery address fields (stored on the order at checkout time)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryName"    TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryPhone"   TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryEmail"   TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryAddress" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryCity"    TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryState"   TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryZip"     TEXT;

-- Add shipping / tracking fields (filled by seller once dispatched)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "trackingNumber"    TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shippingCarrier"   TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "estimatedDelivery" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "dispatchedAt"      TIMESTAMP(3);

-- Index trackingToken for the public tracking endpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_trackingToken_idx" ON "orders"("trackingToken");
