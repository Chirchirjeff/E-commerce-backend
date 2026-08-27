// src/products/products.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';
import {
  ProductSuggestionsDto,
  SearchProductsDto,
} from './dto/search-products.dto';

type NormalizedProductImage = {
  imageUrl: string;
  isPrimary: boolean;
};

type SearchRow = {
  id: string;
  name: string;
  price: number;
  thumbnailUrl: string | null;
  stockQuantity: number;
  marketplaceCategoryId: string;
  marketplaceCategoryName: string;
  shopId: string;
  shopName: string;
  shopSlug: string;
  matchType: 'exact' | 'phrase' | 'prefix' | 'full_text' | 'close';
  nameSimilarity: number;
  total: bigint;
};

type SuggestionRow = { text: string };

export function normalizeProductSearchQuery(query: string): string {
  return query
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  // FIXED: Added shopId parameter to secure the record footprint
  async create(
    createProductDto: CreateProductDto,
    shopId: string | undefined,
    userId: string,
  ) {
    const resolvedShopId = await this.resolveShopId(
      shopId ?? createProductDto.shopId,
      userId,
    );

    // Validate and resolve marketplace category (required)
    const marketplaceCategoryId = await this.resolveMarketplaceCategoryId(
      createProductDto.marketplaceCategoryId,
    );

    const payload: any = {
      name: createProductDto.name,
      description: createProductDto.description,
      price: createProductDto.price,
      stockQuantity: createProductDto.stockQuantity ?? 0,
      shopId: resolvedShopId,
      marketplaceCategoryId,
      categoryId: await this.resolveCategoryId(
        createProductDto.categoryId,
        resolvedShopId,
      ),
      thumbnailUrl: createProductDto.thumbnailUrl,
      images: this.normalizeImages(
        createProductDto.imageUrls ?? createProductDto.images,
      ),
    };

    // Create product
    const product = await this.prisma.client.product.create({
      data: payload,
      include: {
        category: true,
        marketplaceCategory: true,
        shop: true,
        attributeValues: {
          include: { attribute: true },
        },
      },
    });

    // Add attribute values if provided
    if (
      createProductDto.attributeValues &&
      createProductDto.attributeValues.length > 0
    ) {
      await this.setProductAttributeValues(
        product.id,
        marketplaceCategoryId,
        createProductDto.attributeValues,
      );
    }

    // Add to collections if provided
    if (
      createProductDto.collectionIds &&
      createProductDto.collectionIds.length > 0
    ) {
      await this.addProductToCollections(
        product.id,
        createProductDto.collectionIds,
        resolvedShopId,
      );
    }

    // Add tags if provided
    if (createProductDto.tagIds && createProductDto.tagIds.length > 0) {
      await this.addProductTags(
        product.id,
        createProductDto.tagIds,
        resolvedShopId,
      );
    }

    // Return complete product with all relations
    return this.findOne(product.id);
  }

  // OPTIONAL BONUS: You could filter global reads by the shopId too if you want isolation on lists
  async findAll(shopId?: string, search?: string, categoryId?: string) {
    const where: any = {};

    // Filter by shop if provided
    if (shopId) {
      where.shopId = shopId;
    }

    // Filter by marketplace category if provided
    if (categoryId) {
      where.marketplaceCategoryId = categoryId;
    }

    // Filter by search term if provided
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.client.product.findMany({
      where,
      include: {
        category: true,
        marketplaceCategory: true,
        shop: true,
        attributeValues: {
          include: { attribute: true },
        },
        collections: {
          include: { collection: true },
        },
        tags: {
          include: { tag: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Public marketplace search. The Product model has no SKU, brand, status, or
   * soft-delete field, so search is limited to buyer-safe catalog data: name,
   * description, marketplace category, seller tags, and attributes explicitly
   * marked searchable for their category.
   */
  async search(query: SearchProductsDto) {
    const normalizedQuery = this.requireNormalizedSearchQuery(query.q);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const rows = await this.prisma.client.$queryRaw<SearchRow[]>(Prisma.sql`
      WITH search_input AS (
        SELECT
          ${normalizedQuery}::text AS query,
          websearch_to_tsquery('simple', ${normalizedQuery}) AS tsquery
      ),
      searchable_products AS (
        SELECT
          p."id", p."name", p."price", p."thumbnailUrl", p."stockQuantity",
          p."marketplaceCategoryId", mc."name" AS "marketplaceCategoryName",
          s."id" AS "shopId", s."name" AS "shopName", s."slug" AS "shopSlug",
          lower(p."name") AS normalized_name,
          setweight(to_tsvector('simple', coalesce(p."name", '')), 'A') ||
          setweight(to_tsvector('simple', coalesce(p."description", '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(mc."name", '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(tag_values.tags, '')), 'C') ||
          setweight(to_tsvector('simple', coalesce(attribute_values.attributes, '')), 'C')
            AS document,
          coalesce(tag_values.tags, '') AS tags,
          coalesce(attribute_values.attributes, '') AS attributes
        FROM "products" p
        JOIN "marketplace_categories" mc ON mc."id" = p."marketplaceCategoryId"
        JOIN "shops" s ON s."id" = p."shopId"
        LEFT JOIN LATERAL (
          SELECT string_agg(st."name", ' ') AS tags
          FROM "product_tags" pt
          JOIN "seller_tags" st ON st."id" = pt."tagId"
          WHERE pt."productId" = p."id"
        ) tag_values ON true
        LEFT JOIN LATERAL (
          SELECT string_agg(pav."value", ' ') AS attributes
          FROM "product_attribute_values" pav
          JOIN "category_attributes" ca
            ON ca."attributeId" = pav."attributeId"
           AND ca."categoryId" = p."marketplaceCategoryId"
           AND ca."searchable" = true
          WHERE pav."productId" = p."id"
        ) attribute_values ON true
        WHERE mc."isActive" = true
      ),
      ranked AS (
        SELECT sp.*,
          CASE
            WHEN sp.normalized_name = si.query THEN 'exact'
            WHEN position(si.query IN sp.normalized_name) > 0 THEN 'phrase'
            WHEN sp.normalized_name LIKE si.query || '%' THEN 'prefix'
            WHEN sp.document @@ si.tsquery THEN 'full_text'
            ELSE 'close'
          END AS "matchType",
          word_similarity(si.query, sp.normalized_name) AS "nameSimilarity",
          (
            CASE WHEN sp.normalized_name = si.query THEN 1000 ELSE 0 END +
            CASE WHEN position(si.query IN sp.normalized_name) > 0 THEN 500 ELSE 0 END +
            CASE WHEN sp.normalized_name LIKE si.query || '%' THEN 250 ELSE 0 END +
            ts_rank_cd(sp.document, si.tsquery, 32) * 100 +
            word_similarity(si.query, sp.normalized_name) * 50 +
            CASE WHEN sp."stockQuantity" > 0 THEN 1 ELSE 0 END
          ) AS score
        FROM searchable_products sp
        CROSS JOIN search_input si
        WHERE
          sp.normalized_name = si.query
          OR position(si.query IN sp.normalized_name) > 0
          OR sp.normalized_name LIKE si.query || '%'
          OR sp.document @@ si.tsquery
          OR word_similarity(si.query, sp.normalized_name) >= 0.35
      )
      SELECT
        "id", "name", "price", "thumbnailUrl", "stockQuantity",
        "marketplaceCategoryId", "marketplaceCategoryName", "shopId", "shopName", "shopSlug",
        "matchType", "nameSimilarity", count(*) OVER() AS total
      FROM ranked
      ORDER BY score DESC, "name" ASC, "id" ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const total = rows.length ? Number(rows[0].total) : 0;
    const exactMatch = rows.some((row) => row.matchType === 'exact');
    const bestCloseMatch = rows.find(
      (row) => row.matchType === 'close' && row.nameSimilarity >= 0.6,
    );

    return {
      query: query.q,
      normalizedQuery,
      exactMatch,
      correctedQuery:
        !exactMatch && bestCloseMatch ? bestCloseMatch.name : undefined,
      suggestions: !exactMatch && bestCloseMatch ? [bestCloseMatch.name] : [],
      results: rows.map((row) => ({
        id: row.id,
        name: row.name,
        price: row.price,
        thumbnailUrl: row.thumbnailUrl,
        inStock: row.stockQuantity > 0,
        matchType: row.matchType,
        category: {
          id: row.marketplaceCategoryId,
          name: row.marketplaceCategoryName,
        },
        shop: { id: row.shopId, name: row.shopName, slug: row.shopSlug },
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Lightweight product-name-only query for each autocomplete keystroke. */
  async suggestions(query: ProductSuggestionsDto) {
    const normalizedQuery = this.requireNormalizedSearchQuery(query.q);
    const limit = query.limit ?? 8;
    const rows = await this.prisma.client.$queryRaw<SuggestionRow[]>(Prisma.sql`
      SELECT p."name" AS text
      FROM "products" p
      JOIN "marketplace_categories" mc ON mc."id" = p."marketplaceCategoryId"
      WHERE mc."isActive" = true
        AND (
          lower(p."name") LIKE ${`${normalizedQuery}%`}
          OR word_similarity(${normalizedQuery}, lower(p."name")) >= 0.45
        )
      ORDER BY
        CASE WHEN lower(p."name") LIKE ${`${normalizedQuery}%`} THEN 0 ELSE 1 END,
        word_similarity(${normalizedQuery}, lower(p."name")) DESC,
        p."name" ASC
      LIMIT ${limit}
    `);

    return {
      query: query.q,
      normalizedQuery,
      suggestions: rows.map((row) => ({ text: row.text, type: 'product' })),
    };
  }

  private requireNormalizedSearchQuery(query: string): string {
    const normalizedQuery = normalizeProductSearchQuery(query);

    if (normalizedQuery.length < 2) {
      throw new BadRequestException(
        'Search query must contain at least 2 letters or numbers',
      );
    }

    return normalizedQuery;
  }

  async findMine(userId: string) {
    return this.prisma.client.product.findMany({
      where: { shop: { ownerId: userId } },
      include: {
        category: true,
        marketplaceCategory: true,
        shop: true,
        attributeValues: {
          include: { attribute: true },
        },
        collections: {
          include: { collection: true },
        },
        tags: {
          include: { tag: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // FIXED: Expects id to be a string (UUID) instead of a number
  async findOne(id: string) {
    const product = await this.prisma.client.product.findUnique({
      where: { id },
      include: {
        category: true,
        marketplaceCategory: true,
        shop: true,
        attributeValues: {
          include: { attribute: true },
        },
        collections: {
          include: { collection: true },
        },
        tags: {
          include: { tag: true },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  // FIXED: Expects a string id and accepts the cross-verifying shopId footprint
  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    shopId: string | undefined,
    userId: string,
  ) {
    const ownedShopIds = await this.getOwnedShopIds(userId);

    // First ensure the product exists and belongs to this shop
    const product = await this.prisma.client.product.findFirst({
      where: { id, shopId: shopId ?? { in: ownedShopIds } },
    });

    if (!product) {
      throw new NotFoundException(
        'Product not found in this storefront location',
      );
    }

    const payload: any = {
      name: updateProductDto.name,
      description: updateProductDto.description,
      price: updateProductDto.price,
      stockQuantity: updateProductDto.stockQuantity,
      thumbnailUrl: updateProductDto.thumbnailUrl,
      images: this.normalizeImages(
        updateProductDto.imageUrls ?? updateProductDto.images,
      ),
    };

    // Handle marketplace category update
    if (updateProductDto.marketplaceCategoryId !== undefined) {
      payload.marketplaceCategoryId = await this.resolveMarketplaceCategoryId(
        updateProductDto.marketplaceCategoryId,
      );
    }

    // Handle legacy category update
    if (updateProductDto.categoryId !== undefined) {
      payload.categoryId =
        updateProductDto.categoryId === null
          ? null
          : await this.resolveCategoryId(
              updateProductDto.categoryId,
              product.shopId,
            );
    }

    const updatedProduct = await this.prisma.client.product.update({
      where: { id },
      data: payload,
      include: {
        category: true,
        marketplaceCategory: true,
        shop: true,
        attributeValues: {
          include: { attribute: true },
        },
        collections: {
          include: { collection: true },
        },
        tags: {
          include: { tag: true },
        },
      },
    });

    // Update attribute values if provided
    if (
      updateProductDto.attributeValues &&
      updateProductDto.attributeValues.length > 0
    ) {
      await this.setProductAttributeValues(
        id,
        updatedProduct.marketplaceCategoryId,
        updateProductDto.attributeValues,
      );
    }

    // Update collections if provided
    if (updateProductDto.collectionIds !== undefined) {
      await this.updateProductCollections(
        id,
        updateProductDto.collectionIds,
        product.shopId,
      );
    }

    // Update tags if provided
    if (updateProductDto.tagIds !== undefined) {
      await this.updateProductTags(id, updateProductDto.tagIds, product.shopId);
    }

    return this.findOne(id);
  }

  // FIXED: Expects id to be a string (UUID) instead of a number
  async remove(id: string) {
    return this.prisma.client.product.delete({
      where: { id },
    });
  }

  private normalizeImages(
    value: unknown,
  ): NormalizedProductImage[] | undefined {
    if (!value) return undefined;

    if (Array.isArray(value)) {
      const seen = new Set<string>();

      return value.flatMap((item) => {
        if (typeof item === 'string') {
          if (seen.has(item)) return [];
          seen.add(item);
          return [{ imageUrl: item, isPrimary: false }];
        }

        if (item && typeof item === 'object') {
          const candidate = item as Record<string, unknown>;
          if (typeof candidate.imageUrl === 'string') {
            if (seen.has(candidate.imageUrl)) return [];
            seen.add(candidate.imageUrl);
            return [
              {
                imageUrl: candidate.imageUrl,
                isPrimary: Boolean(candidate.isPrimary),
              },
            ];
          }
        }

        return [];
      });
    }

    return undefined;
  }

  private async resolveShopId(shopId: string | undefined, userId: string) {
    if (shopId) {
      const shop = await this.prisma.client.shop.findFirst({
        where: { id: shopId, ownerId: userId },
      });
      if (!shop) {
        throw new NotFoundException('Shop not found for this seller');
      }
      return shop.id;
    }

    const shop = await this.prisma.client.shop.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'asc' },
    });

    if (!shop) {
      throw new BadRequestException('Create a shop before adding products');
    }

    return shop.id;
  }

  private async resolveCategoryId(
    categoryId: string | undefined,
    shopId: string,
  ) {
    if (!categoryId) {
      return undefined;
    }

    const category = await this.prisma.client.category.findFirst({
      where: { id: categoryId, shopId },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException('Category not found for this shop');
    }

    return category.id;
  }

  private async getOwnedShopIds(userId: string) {
    const shops = await this.prisma.client.shop.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });

    return shops.map((shop) => shop.id);
  }

  /**
   * Validate and resolve marketplace category ID
   */
  private async resolveMarketplaceCategoryId(
    categoryId: string | undefined,
  ): Promise<string> {
    if (!categoryId) {
      throw new BadRequestException('Marketplace category is required');
    }

    const category = await this.prisma.client.marketplaceCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, isActive: true },
    });

    if (!category) {
      throw new BadRequestException('Marketplace category not found');
    }

    if (!category.isActive) {
      throw new BadRequestException(
        'Cannot assign an inactive marketplace category',
      );
    }

    return category.id;
  }

  /**
   * Set product attribute values for a category
   */
  private async setProductAttributeValues(
    productId: string,
    categoryId: string,
    attributeValues: Array<{ attributeId: string; value: string }>,
  ): Promise<void> {
    // Get category attributes to validate
    const categoryAttributes =
      await this.prisma.client.categoryAttribute.findMany({
        where: { categoryId },
        include: { attribute: true },
      });

    const categoryAttributeMap = new Map(
      categoryAttributes.map((ca) => [ca.attributeId, ca]),
    );

    // Remove existing values
    await this.prisma.client.productAttributeValue.deleteMany({
      where: { productId },
    });

    // Add new values with validation
    for (const av of attributeValues) {
      const categoryAttr = categoryAttributeMap.get(av.attributeId);

      if (!categoryAttr) {
        throw new BadRequestException(
          `Attribute ${av.attributeId} is not assigned to this category`,
        );
      }

      // Validate required attributes
      if (categoryAttr.required && !av.value) {
        throw new BadRequestException(
          `Attribute ${categoryAttr.attribute.name} is required`,
        );
      }

      await this.prisma.client.productAttributeValue.create({
        data: {
          productId,
          attributeId: av.attributeId,
          value: av.value,
        },
      });
    }
  }

  /**
   * Add product to collections
   */
  private async addProductToCollections(
    productId: string,
    collectionIds: string[],
    sellerId: string,
  ): Promise<void> {
    for (const collectionId of collectionIds) {
      // Verify collection belongs to seller
      const collection = await this.prisma.client.sellerCollection.findUnique({
        where: { id: collectionId },
        select: { sellerId: true },
      });

      if (!collection) {
        throw new BadRequestException('Collection not found');
      }

      if (collection.sellerId !== sellerId) {
        throw new BadRequestException(
          'Collection does not belong to your store',
        );
      }

      // Add to collection
      await this.prisma.client.productCollection
        .create({
          data: {
            productId,
            collectionId,
          },
        })
        .catch(() => {
          // Ignore if already exists
        });
    }
  }

  /**
   * Update product collections
   */
  private async updateProductCollections(
    productId: string,
    collectionIds: string[],
    sellerId: string,
  ): Promise<void> {
    // Remove existing collections
    await this.prisma.client.productCollection.deleteMany({
      where: { productId },
    });

    // Add new collections
    if (collectionIds.length > 0) {
      await this.addProductToCollections(productId, collectionIds, sellerId);
    }
  }

  /**
   * Add tags to product
   */
  private async addProductTags(
    productId: string,
    tagIds: string[],
    sellerId: string,
  ): Promise<void> {
    for (const tagId of tagIds) {
      // Verify tag belongs to seller
      const tag = await this.prisma.client.sellerTag.findUnique({
        where: { id: tagId },
        select: { sellerId: true },
      });

      if (!tag) {
        throw new BadRequestException('Tag not found');
      }

      if (tag.sellerId !== sellerId) {
        throw new BadRequestException('Tag does not belong to your store');
      }

      // Add tag to product
      await this.prisma.client.productTag
        .create({
          data: {
            productId,
            tagId,
          },
        })
        .catch(() => {
          // Ignore if already exists
        });
    }
  }

  /**
   * Update product tags
   */
  private async updateProductTags(
    productId: string,
    tagIds: string[],
    sellerId: string,
  ): Promise<void> {
    // Remove existing tags
    await this.prisma.client.productTag.deleteMany({
      where: { productId },
    });

    // Add new tags
    if (tagIds.length > 0) {
      await this.addProductTags(productId, tagIds, sellerId);
    }
  }
}
