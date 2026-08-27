ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "fulfillmentStatus" TEXT NOT NULL DEFAULT 'NEW',
  ADD COLUMN IF NOT EXISTS "deliveryStatus" TEXT NOT NULL DEFAULT 'NOT_DISPATCHED',
  ADD COLUMN IF NOT EXISTS "escrowStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN IF NOT EXISTS "deliveryMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "trackingUrl" TEXT;

UPDATE "orders"
SET "paymentStatus" = CASE WHEN lower("status") = 'paid' THEN 'PAID' ELSE "paymentStatus" END,
    "fulfillmentStatus" = CASE WHEN lower("status") = 'paid' THEN 'NEW' ELSE "fulfillmentStatus" END;

CREATE INDEX IF NOT EXISTS "orders_fulfillmentStatus_idx" ON "orders"("fulfillmentStatus");
CREATE INDEX IF NOT EXISTS "orders_paymentStatus_idx" ON "orders"("paymentStatus");
CREATE INDEX IF NOT EXISTS "orders_deliveryStatus_idx" ON "orders"("deliveryStatus");

CREATE TABLE IF NOT EXISTS "order_events" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "type" TEXT NOT NULL,
  "message" TEXT NOT NULL, "actorId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "order_events_orderId_createdAt_idx" ON "order_events"("orderId", "createdAt");

CREATE TABLE IF NOT EXISTS "return_requests" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RETURN_REQUESTED', "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "return_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "return_requests_orderId_status_idx" ON "return_requests"("orderId", "status");

CREATE TABLE IF NOT EXISTS "order_disputes" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "reason" TEXT NOT NULL, "evidence" JSONB,
  "sellerResponse" TEXT, "status" TEXT NOT NULL DEFAULT 'OPEN', "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "order_disputes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_disputes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "order_disputes_orderId_status_idx" ON "order_disputes"("orderId", "status");
