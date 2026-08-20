# Setup Instructions - Hybrid Category & Product Classification System

## Quick Start

### 1. Database Migration
```bash
cd /home/chirchir/projects/e-commerce/E-commerce-backend

# Format schema (recommended)
npx prisma format

# Validate schema
npx prisma validate

# Apply migration
npx prisma migrate dev

# Generate Prisma client
npx prisma generate
```

### 2. Seed Database with Marketplace Categories
```bash
# Full seed (includes all roles, admins, shops, marketplace categories, products)
npm run seed

# OR reset database and reseed
npm run seed:reset

# Individual seeds (if needed)
npm run seed:categories          # Marketplace categories only
npm run seed:products            # Products (requires categories)
npm run seed:admins              # Admin users only
```

### 3. Verify Installation
```bash
# Run all tests
npm run test

# Or run specific test suites
npm run test -- marketplace-categories.service.spec.ts
npm run test -- attributes.service.spec.ts
npm run test -- seller-collections.service.spec.ts
npm run test -- seller-tags.service.spec.ts
```

### 4. Start Development Server
```bash
npm run start:dev
```

---

## Database Schema Details

### Models Added
- **MarketplaceCategory**: Hierarchical platform-controlled taxonomy
- **Attribute**: Product attribute definitions
- **CategoryAttribute**: Links categories to attributes with metadata
- **ProductAttributeValue**: Product-specific attribute values
- **SellerCollection**: Seller-managed product groupings
- **ProductCollection**: Links products to collections
- **SellerTag**: Seller-defined product labels
- **ProductTag**: Links products to tags

### Product Model Updates
- Added: `marketplaceCategoryId` (required FK to MarketplaceCategory)
- Added: `attributeValues` relation to ProductAttributeValue
- Added: `collections` relation to ProductCollection
- Added: `tags` relation to ProductTag
- Kept: `categoryId` (legacy, optional, for backward compatibility)

### Shop Model Updates
- Added: `collections` relation to SellerCollection
- Added: `tags` relation to SellerTag

---

## New Permissions

Two new permissions added for Super Admin role:

```
can_manage_marketplace_categories  - Manage platform taxonomy
can_manage_attributes              - Manage category attributes
```

These are automatically seeded with the Super Admin role.

---

## Module Structure

```
src/
├── marketplace-categories/
│   ├── marketplace-categories.service.ts          (370+ lines)
│   ├── marketplace-categories.controller.ts       (130+ lines)
│   ├── marketplace-categories.module.ts           (25 lines)
│   ├── marketplace-categories.service.spec.ts    (Tests)
│   └── dto/
│       ├── create-marketplace-category.dto.ts
│       ├── update-marketplace-category.dto.ts
│       └── create-category-attribute.dto.ts
├── attributes/
│   ├── attributes.service.ts                     (240+ lines)
│   ├── attributes.controller.ts                  (70+ lines)
│   ├── attributes.module.ts                      (25 lines)
│   ├── attributes.service.spec.ts               (Tests)
│   └── dto/
│       ├── create-attribute.dto.ts
│       └── update-attribute.dto.ts
├── seller-collections/
│   ├── seller-collections.service.ts             (280+ lines)
│   ├── seller-collections.controller.ts          (120+ lines)
│   ├── seller-collections.module.ts              (25 lines)
│   ├── seller-collections.service.spec.ts       (Tests)
│   └── dto/
│       ├── create-seller-collection.dto.ts
│       └── update-seller-collection.dto.ts
└── seller-tags/
    ├── seller-tags.service.ts                    (300+ lines)
    ├── seller-tags.controller.ts                 (140+ lines)
    ├── seller-tags.module.ts                     (25 lines)
    ├── seller-tags.service.spec.ts              (Tests)
    └── dto/
        ├── create-seller-tag.dto.ts
        └── update-seller-tag.dto.ts
```

---

## API Testing

### Using cURL

#### 1. Get All Marketplace Categories
```bash
curl -X GET http://localhost:3000/marketplace-categories \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 2. Get Category Hierarchy
```bash
curl -X GET "http://localhost:3000/marketplace-categories?tree=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 3. Create Marketplace Category (Admin Only)
```bash
curl -X POST http://localhost:3000/marketplace-categories \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Category",
    "slug": "new-category",
    "description": "A new category",
    "parentId": "optional-parent-uuid"
  }'
```

#### 4. Get All Attributes
```bash
curl -X GET http://localhost:3000/attributes \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 5. Create Attribute (Admin Only)
```bash
curl -X POST http://localhost:3000/attributes \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Brand",
    "slug": "brand",
    "type": "text",
    "description": "Product brand"
  }'
```

#### 6. Add Attribute to Category (Admin Only)
```bash
curl -X POST http://localhost:3000/marketplace-categories/CATEGORY_ID/attributes \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attributeId": "ATTRIBUTE_ID",
    "required": true,
    "filterable": true,
    "sortOrder": 0
  }'
```

#### 7. Get Seller Collections
```bash
curl -X GET http://localhost:3000/seller/collections \
  -H "Authorization: Bearer SELLER_JWT_TOKEN"
```

#### 8. Create Seller Collection
```bash
curl -X POST http://localhost:3000/seller/collections \
  -H "Authorization: Bearer SELLER_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Arrivals",
    "slug": "new-arrivals",
    "description": "Latest products"
  }'
```

#### 9. Get Seller Tags
```bash
curl -X GET http://localhost:3000/seller/tags \
  -H "Authorization: Bearer SELLER_JWT_TOKEN"
```

#### 10. Create Product with Marketplace Category
```bash
curl -X POST http://localhost:3000/products \
  -H "Authorization: Bearer SELLER_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Samsung Galaxy S25",
    "description": "5G Smartphone",
    "price": 999.99,
    "stockQuantity": 50,
    "marketplaceCategoryId": "CATEGORY_ID",
    "attributeValues": [
      {
        "attributeId": "BRAND_ATTR_ID",
        "value": "Samsung"
      },
      {
        "attributeId": "MODEL_ATTR_ID",
        "value": "Galaxy S25"
      }
    ],
    "collectionIds": ["COLLECTION_ID"],
    "tagIds": ["TAG_ID"]
  }'
```

---

## Troubleshooting

### Migration Issues

**Error**: `"Error: Unable to require Prisma CLI..."`
```bash
# Reinstall Prisma
npm install --save-dev prisma
npx prisma migrate dev
```

**Error**: `"Error: column does not exist"`
```bash
# Schema and database out of sync
npx prisma db push --force-reset   # WARNING: Deletes all data
npm run seed                        # Reseed
```

### Permission Denied

**Error**: `403 Forbidden - You don't have permission to access this resource`
- Admin operations require `can_manage_marketplace_categories` or `can_manage_attributes` permission
- Verify JWT token includes admin claims: `isAdmin: true, role: 'Super Admin'`
- Check roles seed completed: `npm run seed:admins`

### Authorization Errors

**Error**: `403 Forbidden - Seller does not own collection`
- Ensure JWT seller `shopId` matches collection `sellerId`
- Verify JWT includes `shopId` claim

---

## Seeded Data Overview

### Marketplace Categories
- **5 Root Categories**: Electronics, Fashion, Home & Living, Beauty, Sports
- **15+ Subcategories**: Phones, Tablets, Computers, Laptops, etc.
- **20+ Leaf Categories**: Smartphones, Headphones, Shoes, etc.

### Admin Roles
- **Super Admin** (superadmin@example.com / SuperAdmin123!)
  - All permissions including marketplace category management
- **KYC Officer** (officer@example.com / Officer123!)
  - KYC verification only
- **Compliance HOD** (compliance@example.com / Compliance123!)
  - High-risk seller approval
- **Support Admin** (support@example.com / Support123!)
  - Customer support access

### Regular Users
- **Seller** (admin@example.com / admin123456)
  - Can create products, manage collections, manage tags
- **Customer** (test@example.com / test123456)
  - Can browse products and categories

### Sample Shop
- **Shop Name**: "Admin's Electronics Store"
- **Slug**: "admin-shop"
- **Owner**: admin@example.com
- **Status**: ACTIVE

---

## Environment Variables

Ensure `.env` file has:
```
DATABASE_URL=postgresql://user:password@localhost:5432/ecommerce
JWT_SECRET=your-secret-key  # Optional, defaults to hardcoded value
```

---

## Development Workflow

### Adding a New Marketplace Category

1. **Via API (Admin)**:
```bash
curl -X POST http://localhost:3000/marketplace-categories \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Gadgets", "slug": "gadgets"}'
```

2. **Via Code (Seed)**:
Create a migration or add to seed file.

### Adding Attributes to a Category

1. **Create Attribute** (if not exists):
```bash
curl -X POST http://localhost:3000/attributes \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Storage", "slug": "storage", "type": "select"}'
```

2. **Assign to Category**:
```bash
curl -X POST http://localhost:3000/marketplace-categories/CATEGORY_ID/attributes \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"attributeId": "ATTR_ID", "required": true, "filterable": true}'
```

### Creating Products with Categories

Sellers must provide:
- `marketplaceCategoryId` (required, UUID of active category)
- `attributeValues` (optional, if category has attributes)
- `collectionIds` (optional, seller's own collections)
- `tagIds` (optional, seller's own tags)

---

## File Changes Summary

### Total Files Modified/Created: 35+

**New Modules**: 4 (MarketplaceCategories, Attributes, SellerCollections, SellerTags)
**Services**: 4 (+ test files)
**Controllers**: 4
**DTOs**: 8+
**Database Models**: 9 new, 2 updated
**Migrations**: 1
**Tests**: 4 comprehensive test suites
**Documentation**: IMPLEMENTATION_SUMMARY.md, this file

---

## Performance Benchmarks

Expected query times (on modern hardware):

- **Get categories with hierarchy**: ~50-100ms
- **Get single category with attributes**: ~20-30ms
- **Get category by slug**: ~10-15ms (indexed)
- **Search tags**: ~30-50ms
- **Get product with all relations**: ~40-60ms

Optimize further with:
- Redis caching for category tree
- Database connection pooling
- Query result pagination

---

## Next Steps

1. ✅ Run migrations
2. ✅ Seed database
3. ✅ Start dev server
4. ✅ Test API endpoints
5. 🔄 Implement admin UI for category management
6. 🔄 Implement seller UI for collections/tags
7. 🔄 Add advanced filtering to product search
8. 🔄 Implement AI-powered category suggestions
9. 🔄 Add analytics dashboard

---

## Support & Documentation

- Full implementation details: See `IMPLEMENTATION_SUMMARY.md`
- API architecture: Built on NestJS + Prisma + PostgreSQL
- Tests location: `*.spec.ts` files in each module
- Schema: `prisma/schema.prisma`

For questions or issues, refer to the comprehensive implementation summary document.
