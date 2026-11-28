-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_buyerId_fkey";

-- AlterTable
ALTER TABLE "product_link_visits" ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmContent" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT,
ADD COLUMN     "utmTerm" TEXT;

-- AlterTable
ALTER TABLE "shop_link_visits" ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmContent" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT,
ADD COLUMN     "utmTerm" TEXT;

-- AlterTable
ALTER TABLE "system_docs" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "utm_visits" (
    "id" TEXT NOT NULL,
    "shopId" TEXT,
    "utmSource" TEXT NOT NULL,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "referer" TEXT,
    "deviceType" TEXT,
    "browser" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utm_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "utm_visits_shopId_idx" ON "utm_visits"("shopId");

-- CreateIndex
CREATE INDEX "utm_visits_utmSource_idx" ON "utm_visits"("utmSource");

-- CreateIndex
CREATE INDEX "utm_visits_utmCampaign_idx" ON "utm_visits"("utmCampaign");

-- CreateIndex
CREATE INDEX "utm_visits_visitedAt_idx" ON "utm_visits"("visitedAt");

-- CreateIndex
CREATE INDEX "product_link_visits_utmSource_idx" ON "product_link_visits"("utmSource");

-- CreateIndex
CREATE INDEX "product_link_visits_utmCampaign_idx" ON "product_link_visits"("utmCampaign");

-- CreateIndex
CREATE INDEX "shop_link_visits_utmSource_idx" ON "shop_link_visits"("utmSource");

-- CreateIndex
CREATE INDEX "shop_link_visits_utmCampaign_idx" ON "shop_link_visits"("utmCampaign");

-- AddForeignKey
ALTER TABLE "utm_visits" ADD CONSTRAINT "utm_visits_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
