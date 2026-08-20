-- CreateTable
CREATE TABLE "shop_links" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "source" TEXT,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "lastClickedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_link_visits" (
    "id" TEXT NOT NULL,
    "shopLinkId" TEXT NOT NULL,
    "userAgent" TEXT,
    "referer" TEXT,
    "ipHash" TEXT,
    "deviceType" TEXT,
    "browser" TEXT,
    "country" TEXT,
    "region" TEXT,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_link_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_links_token_key" ON "shop_links"("token");

-- CreateIndex
CREATE INDEX "shop_links_shopId_idx" ON "shop_links"("shopId");

-- CreateIndex
CREATE INDEX "shop_links_token_idx" ON "shop_links"("token");

-- CreateIndex
CREATE INDEX "shop_links_isActive_idx" ON "shop_links"("isActive");

-- CreateIndex
CREATE INDEX "shop_links_createdAt_idx" ON "shop_links"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "shop_links_shopId_token_key" ON "shop_links"("shopId", "token");

-- CreateIndex
CREATE INDEX "shop_link_visits_shopLinkId_idx" ON "shop_link_visits"("shopLinkId");

-- CreateIndex
CREATE INDEX "shop_link_visits_visitedAt_idx" ON "shop_link_visits"("visitedAt");

-- AddForeignKey
ALTER TABLE "shop_links" ADD CONSTRAINT "shop_links_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_link_visits" ADD CONSTRAINT "shop_link_visits_shopLinkId_fkey" FOREIGN KEY ("shopLinkId") REFERENCES "shop_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
