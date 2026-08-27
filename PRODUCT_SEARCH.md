# Product search API

This backend's `Product` model has product name, description, price, stock,
images, marketplace category, seller tags, and category-defined attribute
values. It does not currently have SKU, brand, product status, soft deletion,
or variants. Search therefore never invents filters for those absent fields.

Only products in active marketplace categories are returned. Existing product
listing behaviour does not restrict shops or out-of-stock products, so search
preserves that policy and returns `inStock` for the frontend to present the
availability state.

## Endpoints

`GET /products/search?q=samsung%20s24&page=1&limit=20`

```json
{
  "query": "samsng s24",
  "normalizedQuery": "samsng s24",
  "exactMatch": false,
  "correctedQuery": "Samsung Galaxy S24",
  "suggestions": ["Samsung Galaxy S24"],
  "results": [
    {
      "id": "...",
      "name": "Samsung Galaxy S24",
      "price": 999,
      "thumbnailUrl": "/uploads/s24.jpg",
      "inStock": true,
      "matchType": "close",
      "category": { "id": "...", "name": "Mobile Phones" },
      "shop": { "id": "...", "name": "Example Store", "slug": "example-store" }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

`GET /products/search/suggestions?q=sams&limit=8`

```json
{
  "query": "sams",
  "normalizedQuery": "sams",
  "suggestions": [{ "text": "Samsung Galaxy S24", "type": "product" }]
}
```

Both endpoints are public and require a 2–120 character query. The original
query is preserved in the response; normalizing only collapses whitespace,
normalizes casing, and treats punctuation as separators.

## Ranking and matching

The full search route ranks exact product names, contained phrases, prefixes,
PostgreSQL full-text relevance, then `pg_trgm` word similarity. In-stock status
is a small tie-breaker only, so it cannot outrank a substantially better name
match. Full-text documents weight name highest, followed by description and
marketplace category, then seller tags and only attribute values whose
`CategoryAttribute.searchable` flag is true.

The response provides a `correctedQuery` only for a high-confidence fuzzy
product-name match. Otherwise it returns close/related results with the
`matchType` field and does not claim a correction.

Autocomplete intentionally searches product names only, uses a small bounded
result set, and prioritizes prefix matches before fuzzy matches. This avoids
the heavier relation aggregation used by the full search route on each keypress.

## Database migration

Migration: `20260827110000_add_product_search_indexes`

It enables `pg_trgm`, then adds a GIN trigram index on normalized product names
and a GIN full-text index on product-owned name/description text. Related fields
are assembled at query time because PostgreSQL generated columns cannot read
relations. The migration is additive but index creation can take a write lock
while an existing large table is indexed; schedule it appropriately in
production.

Run it with:

```bash
npx prisma migrate deploy
```

For a development database:

```bash
npx prisma migrate dev
```

## Verification

```bash
npm test -- --runInBand src/products/products.search.spec.ts
npm run build
```

Future enhancements, if the schema gains the data, are SKU/brand indexing,
explicit product publication status, and a maintained denormalized search
document for very large catalogs or category/tag-only discovery.
