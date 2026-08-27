-- CreateTable
CREATE TABLE "mpesa_transactions" (
    "id" TEXT NOT NULL,
    "merchantRequestId" TEXT,
    "checkoutRequestId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "responseCode" TEXT,
    "responseDescription" TEXT,
    "resultCode" TEXT,
    "resultDescription" TEXT,
    "mpesaReceiptNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT,
    "callbackMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mpesa_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mpesa_transactions_checkoutRequestId_key" ON "mpesa_transactions"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "mpesa_transactions_orderId_key" ON "mpesa_transactions"("orderId");

-- CreateIndex
CREATE INDEX "mpesa_transactions_checkoutRequestId_idx" ON "mpesa_transactions"("checkoutRequestId");

-- CreateIndex
CREATE INDEX "mpesa_transactions_status_idx" ON "mpesa_transactions"("status");

-- CreateIndex
CREATE INDEX "mpesa_transactions_phoneNumber_idx" ON "mpesa_transactions"("phoneNumber");

-- CreateIndex
CREATE INDEX "mpesa_transactions_createdAt_idx" ON "mpesa_transactions"("createdAt");

-- AddForeignKey
ALTER TABLE "mpesa_transactions" ADD CONSTRAINT "mpesa_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
