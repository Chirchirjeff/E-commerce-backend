-- Add human-readable order numbers
-- Format: QZ-YYYYMMDD-NNNNN  e.g. QZ-20260824-00001

-- Step 1: Add as nullable first so existing rows don't fail
ALTER TABLE "orders" ADD COLUMN "orderNumber" TEXT;

-- Step 2: Backfill existing rows using a CTE (window functions not allowed in plain UPDATE)
WITH numbered AS (
  SELECT
    id,
    'QZ-' ||
    TO_CHAR("createdAt", 'YYYYMMDD') || '-' ||
    LPAD(
      CAST(
        ROW_NUMBER() OVER (
          PARTITION BY DATE("createdAt")
          ORDER BY "createdAt"
        ) AS TEXT
      ),
      5, '0'
    ) AS generated_number
  FROM orders
)
UPDATE orders
SET "orderNumber" = numbered.generated_number
FROM numbered
WHERE orders.id = numbered.id;

-- Step 3: Lock it in as NOT NULL + UNIQUE
ALTER TABLE "orders" ALTER COLUMN "orderNumber" SET NOT NULL;
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");
CREATE INDEX "orders_orderNumber_idx" ON "orders"("orderNumber");

-- Step 4: Add orderNumber to mpesa_transactions for admin lookups without a join
ALTER TABLE "mpesa_transactions" ADD COLUMN "orderNumber" TEXT;
