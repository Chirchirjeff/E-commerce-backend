-- Migration: add salePrice and descriptionBlocks to products
-- salePrice: optional discounted price (original price shown crossed out when set)
-- descriptionBlocks: JSON array of rich description blocks (text / table / image)

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "salePrice" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "descriptionBlocks" JSONB;

-- Index for filtering/sorting by sale price
CREATE INDEX IF NOT EXISTS "products_salePrice_idx" ON "products"("salePrice");
