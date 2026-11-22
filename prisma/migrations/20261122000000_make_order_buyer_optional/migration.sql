-- Make orders.buyerId nullable to support guest purchases.
-- The Prisma schema already declares buyerId as String? (optional), but earlier
-- migrations created the column as NOT NULL. This migration brings the database
-- into alignment with the schema so guest orders (no buyer account) can be
-- created by the M-Pesa callback.
ALTER TABLE "orders" ALTER COLUMN "buyerId" DROP NOT NULL;
