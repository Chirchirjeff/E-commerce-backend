-- Migration: add_system_docs
-- Creates the system_docs table for admin-uploaded reference documents.

CREATE TABLE "system_docs" (
    "id"          TEXT         NOT NULL,
    "title"       TEXT         NOT NULL,
    "fileName"    TEXT         NOT NULL,
    "mimeType"    TEXT         NOT NULL,
    "fileSize"    INTEGER      NOT NULL,
    "fileUrl"     TEXT         NOT NULL,
    "category"    TEXT,
    "description" TEXT,
    "uploadedBy"  TEXT         NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_docs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "system_docs_category_idx"    ON "system_docs"("category");
CREATE INDEX "system_docs_uploadedBy_idx"  ON "system_docs"("uploadedBy");
CREATE INDEX "system_docs_createdAt_idx"   ON "system_docs"("createdAt");
