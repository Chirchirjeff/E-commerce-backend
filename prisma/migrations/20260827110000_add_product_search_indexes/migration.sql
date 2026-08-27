-- PostgreSQL-native search support. Prisma does not model pg_trgm or expression
-- indexes, so these are intentionally maintained as SQL migration statements.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Supports case-insensitive prefix, partial-name, and fuzzy product-name search.
CREATE INDEX "products_name_trgm_idx"
  ON "products" USING GIN (lower("name") gin_trgm_ops);

-- Product-owned full-text document. Related category/tag/specification text is
-- weighted at query time, because generated columns cannot reference relations.
CREATE INDEX "products_search_vector_idx"
  ON "products" USING GIN (
    to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("description", ''))
  );
