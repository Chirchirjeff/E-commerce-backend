-- Migration: add_email_failures
-- Records seller emails that could not be delivered so admins are alerted
-- in the dashboard and can retry them.

CREATE TABLE "email_failures" (
    "id"             TEXT         NOT NULL,
    "kind"           TEXT         NOT NULL,
    "kycId"          TEXT,
    "outcome"        TEXT,
    "recipientEmail" TEXT         NOT NULL,
    "recipientName"  TEXT,
    "error"          TEXT         NOT NULL,
    "attempts"       INTEGER      NOT NULL DEFAULT 1,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"     TIMESTAMP(3),
    "resolvedBy"     TEXT,
    "resolution"     TEXT,

    CONSTRAINT "email_failures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_failures_resolvedAt_createdAt_idx" ON "email_failures"("resolvedAt", "createdAt");
CREATE INDEX "email_failures_kycId_idx" ON "email_failures"("kycId");
