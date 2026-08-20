-- CreateTable
CREATE TABLE "product_links" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "source" TEXT,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "lastClickedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_link_visits" (
    "id" TEXT NOT NULL,
    "productLinkId" TEXT NOT NULL,
    "userAgent" TEXT,
    "referer" TEXT,
    "ipHash" TEXT,
    "deviceType" TEXT,
    "browser" TEXT,
    "country" TEXT,
    "region" TEXT,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_link_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_links_token_key" ON "product_links"("token");

-- CreateIndex
CREATE INDEX "product_links_productId_idx" ON "product_links"("productId");

-- CreateIndex
CREATE INDEX "product_links_token_idx" ON "product_links"("token");

-- CreateIndex
CREATE INDEX "product_links_isActive_idx" ON "product_links"("isActive");

-- CreateIndex
CREATE INDEX "product_links_createdAt_idx" ON "product_links"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_links_productId_token_key" ON "product_links"("productId", "token");

-- CreateIndex
CREATE INDEX "product_link_visits_productLinkId_idx" ON "product_link_visits"("productLinkId");

-- CreateIndex
CREATE INDEX "product_link_visits_visitedAt_idx" ON "product_link_visits"("visitedAt");

-- AddForeignKey
ALTER TABLE "product_links" ADD CONSTRAINT "product_links_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_link_visits" ADD CONSTRAINT "product_link_visits_productLinkId_fkey" FOREIGN KEY ("productLinkId") REFERENCES "product_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
