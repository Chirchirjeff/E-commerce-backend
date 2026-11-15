-- Migration: add_gpc_taxonomy
-- Adds GS1 GPC provenance fields to marketplace_categories and a new
-- gpc_taxonomy_versions table for controlled versioned updates.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. GPC Taxonomy Versions table
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE "gpc_taxonomy_versions" (
    "id"          TEXT         NOT NULL,
    "releaseDate" TEXT         NOT NULL,
    "label"       TEXT         NOT NULL,
    "isCurrent"   BOOLEAN      NOT NULL DEFAULT false,
    "nodeCount"   INTEGER      NOT NULL DEFAULT 0,
    "importedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gpc_taxonomy_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gpc_taxonomy_versions_releaseDate_key"
    ON "gpc_taxonomy_versions"("releaseDate");

CREATE INDEX "gpc_taxonomy_versions_isCurrent_idx"
    ON "gpc_taxonomy_versions"("isCurrent");

-- ──────────────────────────────────────────────────────────────────────────
-- 2. GPC provenance columns on marketplace_categories
-- ──────────────────────────────────────────────────────────────────────────

-- Remove the old name uniqueness constraint if it still exists (pre-GPC
-- schemas had name @unique; the new schema drops it because GPC has many
-- nodes sharing the same name in different branches).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'marketplace_categories'
          AND indexname IN (
            'marketplace_categories_name_key',
            '"marketplace_categories_name_key"'
          )
    ) THEN
        DROP INDEX IF EXISTS marketplace_categories_name_key;
    END IF;
END$$;

ALTER TABLE "marketplace_categories"
    ADD COLUMN "gpcCode"       INTEGER,
    ADD COLUMN "gpcLevel"      TEXT NOT NULL DEFAULT 'CUSTOM',
    ADD COLUMN "isGpcStandard" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "gpcVersionId"  TEXT;

ALTER TABLE "marketplace_categories"
    ADD CONSTRAINT "marketplace_categories_gpcVersionId_fkey"
        FOREIGN KEY ("gpcVersionId")
        REFERENCES "gpc_taxonomy_versions"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "marketplace_categories_gpcCode_idx"
    ON "marketplace_categories"("gpcCode");

CREATE INDEX "marketplace_categories_isGpcStandard_idx"
    ON "marketplace_categories"("isGpcStandard");

CREATE INDEX "marketplace_categories_gpcVersionId_idx"
    ON "marketplace_categories"("gpcVersionId");

-- Back-fill existing hand-curated categories as CUSTOM
UPDATE "marketplace_categories"
SET    "gpcLevel" = 'CUSTOM',
       "isGpcStandard" = false
WHERE  "isGpcStandard" = false;
