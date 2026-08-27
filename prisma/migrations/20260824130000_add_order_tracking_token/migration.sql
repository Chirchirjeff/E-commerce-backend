-- Add unguessable public order tracking links.
ALTER TABLE "orders" ADD COLUMN "trackingToken" TEXT;

UPDATE "orders"
SET "trackingToken" = md5(random()::text || clock_timestamp()::text || id)
WHERE "trackingToken" IS NULL;

ALTER TABLE "orders" ALTER COLUMN "trackingToken" SET NOT NULL;
CREATE UNIQUE INDEX "orders_trackingToken_key" ON "orders"("trackingToken");