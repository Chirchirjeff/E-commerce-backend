import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateSellerCollectionDto } from './dto/create-seller-collection.dto';
import { UpdateSellerCollectionDto } from './dto/update-seller-collection.dto';

@Injectable()
export class SellerCollectionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Public read — active collections for a shop with trimmed product data
   * for storefront carousel rendering.
   */
  async findPublicByShop(shopId: string): Promise<any[]> {
    const collections = await this.prisma.client.sellerCollection.findMany({
      where: {
        sellerId: shopId,
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
      include: {
        products: {
          take: 20, // cap per carousel
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                thumbnailUrl: true,
                images: true,
                stockQuantity: true,
              },
            },
          },
        },
        _count: { select: { products: true } },
      },
    });

    // Flatten so each collection carries products directly (not via join table)
    return collections.map((col) => ({
      id: col.id,
      name: col.name,
      slug: col.slug,
      description: col.description,
      sortOrder: col.sortOrder,
      productCount: col._count.products,
      products: col.products.map((pc) => pc.product),
    }));
  }

  /**
   * Create a seller collection
   */
  async create(
    createCollectionDto: CreateSellerCollectionDto,
    sellerId: string,
  ): Promise<any> {
    // Verify seller exists
    const seller = await this.prisma.client.shop.findUnique({
      where: { id: sellerId },
      select: { id: true },
    });

    if (!seller) {
      throw new NotFoundException('Seller shop not found');
    }

    // Check slug uniqueness within seller's collections
    const existingSlug = await this.prisma.client.sellerCollection.findUnique({
      where: {
        sellerId_slug: {
          sellerId,
          slug: createCollectionDto.slug,
        },
      },
      select: { id: true },
    });

    if (existingSlug) {
      throw new BadRequestException(
        'Collection slug must be unique within your store',
      );
    }

    return this.prisma.client.sellerCollection.create({
      data: {
        sellerId,
        name: createCollectionDto.name,
        slug: createCollectionDto.slug,
        description: createCollectionDto.description,
        isActive: true,
        sortOrder: createCollectionDto.sortOrder ?? 0,
      },
      include: {
        products: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
              },
            },
          },
        },
        _count: {
          select: { products: true },
        },
      },
    });
  }

  /**
   * Get all collections for a seller
   */
  async findAllBySellerAdmin(
    sellerId: string,
    includeInactive: boolean = false,
  ): Promise<any[]> {
    return this.prisma.client.sellerCollection.findMany({
      where: {
        sellerId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
  }

  /**
   * Get a single collection
   */
  async findOne(collectionId: string, sellerId?: string): Promise<any> {
    const collection =
      await this.prisma.client.sellerCollection.findUnique({
        where: { id: collectionId },
        include: {
          products: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  thumbnailUrl: true,
                },
              },
            },
          },
          _count: {
            select: { products: true },
          },
        },
      });

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    // Check ownership if sellerId provided
    if (sellerId && collection.sellerId !== sellerId) {
      throw new ForbiddenException(
        'You do not have access to this collection',
      );
    }

    return collection;
  }

  /**
   * Get collection by slug (for a specific seller)
   */
  async findBySlug(slug: string, sellerId: string): Promise<any> {
    const collection =
      await this.prisma.client.sellerCollection.findUnique({
        where: {
          sellerId_slug: {
            sellerId,
            slug,
          },
        },
        include: {
          products: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  thumbnailUrl: true,
                },
              },
            },
          },
          _count: {
            select: { products: true },
          },
        },
      });

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    return collection;
  }

  /**
   * Update a seller collection
   */
  async update(
    collectionId: string,
    updateCollectionDto: UpdateSellerCollectionDto,
    sellerId: string,
  ): Promise<any> {
    const collection = await this.findOne(collectionId, sellerId);

    // Check slug uniqueness if updating slug
    if (
      updateCollectionDto.slug &&
      updateCollectionDto.slug !== collection.slug
    ) {
      const existingSlug = await this.prisma.client.sellerCollection.findUnique(
        {
          where: {
            sellerId_slug: {
              sellerId,
              slug: updateCollectionDto.slug,
            },
          },
          select: { id: true },
        },
      );

      if (existingSlug) {
        throw new BadRequestException(
          'Collection slug must be unique within your store',
        );
      }
    }

    const updateData: any = {};
    if (updateCollectionDto.name) updateData.name = updateCollectionDto.name;
    if (updateCollectionDto.slug) updateData.slug = updateCollectionDto.slug;
    if (updateCollectionDto.description !== undefined) {
      updateData.description = updateCollectionDto.description;
    }
    if (updateCollectionDto.sortOrder !== undefined) {
      updateData.sortOrder = updateCollectionDto.sortOrder;
    }

    return this.prisma.client.sellerCollection.update({
      where: { id: collectionId },
      data: updateData,
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
  }

  /**
   * Deactivate a collection
   */
  async deactivate(collectionId: string, sellerId: string): Promise<any> {
    const collection = await this.findOne(collectionId, sellerId);

    if (!collection.isActive) {
      throw new BadRequestException('Collection is already inactive');
    }

    return this.prisma.client.sellerCollection.update({
      where: { id: collectionId },
      data: { isActive: false },
    });
  }

  /**
   * Reactivate a collection
   */
  async activate(collectionId: string, sellerId: string): Promise<any> {
    const collection = await this.findOne(collectionId, sellerId);

    if (collection.isActive) {
      throw new BadRequestException('Collection is already active');
    }

    return this.prisma.client.sellerCollection.update({
      where: { id: collectionId },
      data: { isActive: true },
    });
  }

  /**
   * Delete a collection
   */
  async remove(collectionId: string, sellerId: string): Promise<any> {
    const collection = await this.findOne(collectionId, sellerId);

    return this.prisma.client.sellerCollection.delete({
      where: { id: collectionId },
    });
  }

  /**
   * Add a product to a collection
   */
  async addProduct(
    collectionId: string,
    productId: string,
    sellerId: string,
  ): Promise<any> {
    // Verify collection belongs to seller
    const collection = await this.findOne(collectionId, sellerId);

    // Verify product exists and belongs to seller
    const product = await this.prisma.client.product.findUnique({
      where: { id: productId },
      select: { id: true, shopId: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.shopId !== sellerId) {
      throw new ForbiddenException('Product does not belong to your store');
    }

    // Check if product is already in collection
    const existing = await this.prisma.client.productCollection.findUnique({
      where: {
        productId_collectionId: {
          productId,
          collectionId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Product is already in this collection',
      );
    }

    return this.prisma.client.productCollection.create({
      data: {
        productId,
        collectionId,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
      },
    });
  }

  /**
   * Remove a product from a collection
   */
  async removeProduct(
    collectionId: string,
    productId: string,
    sellerId: string,
  ): Promise<any> {
    // Verify collection belongs to seller
    await this.findOne(collectionId, sellerId);

    const productCollection =
      await this.prisma.client.productCollection.findUnique({
        where: {
          productId_collectionId: {
            productId,
            collectionId,
          },
        },
      });

    if (!productCollection) {
      throw new NotFoundException('Product not in this collection');
    }

    return this.prisma.client.productCollection.delete({
      where: {
        productId_collectionId: {
          productId,
          collectionId,
        },
      },
    });
  }

  /**
   * Get all products in a collection
   */
  async getCollectionProducts(
    collectionId: string,
    sellerId?: string,
  ): Promise<any[]> {
    // Verify collection exists
    const collection = await this.findOne(collectionId, sellerId);

    return this.prisma.client.productCollection.findMany({
      where: { collectionId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            thumbnailUrl: true,
            marketplaceCategory: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Parametric smart-suggest.
   * ─────────────────────────────────────────────────────────────────────────
   * strategy: new_arrivals | best_sellers | clearance | high_rated |
   *           low_stock    | price_drop
   * ─────────────────────────────────────────────────────────────────────────
   * Common option fields (all optional, defaults shown):
   *   limit              – max results returned          (default 30)
   *   minPrice / maxPrice – price range filter
   *
   * Per-strategy options:
   *   new_arrivals   windowDays (7)   — listed within last N days
   *   best_sellers   windowDays (90)  — order window; limit (20)
   *   clearance      minDaysSinceListed (30), maxStock (20)
   *                  — old + low/no-movement stock
   *   high_rated     minRating (4.0), minReviews (3)
   *   low_stock      maxStock (10), minStock (1)
   *                  — still sellable but nearly out of stock
   *   price_drop     (no extra params — surfaces most recently updated
   *                  products, i.e. potential price-drop candidates)
   */
  async suggest(
    collectionId: string,
    sellerId: string,
    opts: {
      strategy: string
      windowDays?: number
      minDaysSinceListed?: number
      minRating?: number
      minReviews?: number
      maxStock?: number
      minStock?: number
      minPrice?: number
      maxPrice?: number
      limit?: number
    },
  ): Promise<any[]> {
    await this.findOne(collectionId, sellerId);

    // IDs already in this collection — excluded from all results
    const existing = await this.prisma.client.productCollection.findMany({
      where: { collectionId },
      select: { productId: true },
    });
    const excludedIds = existing.map((e) => e.productId);

    const priceFilter: any =
      opts.minPrice !== undefined || opts.maxPrice !== undefined
        ? {
            ...(opts.minPrice !== undefined ? { gte: opts.minPrice } : {}),
            ...(opts.maxPrice !== undefined ? { lte: opts.maxPrice } : {}),
          }
        : undefined;

    const productSelect = {
      id: true,
      name: true,
      price: true,
      stockQuantity: true,
      thumbnailUrl: true,
      createdAt: true,
      updatedAt: true,
      marketplaceCategory: { select: { id: true, name: true } },
    };

    const baseWhere = {
      shopId: sellerId,
      ...(excludedIds.length ? { id: { notIn: excludedIds } } : {}),
      ...(priceFilter ? { price: priceFilter } : {}),
    };

    const limit = Math.min(opts.limit ?? 30, 100);

    // ── new_arrivals ──────────────────────────────────────────────────────
    if (opts.strategy === 'new_arrivals') {
      const days = opts.windowDays ?? 7;
      const since = new Date();
      since.setDate(since.getDate() - days);
      return this.prisma.client.product.findMany({
        where: { ...baseWhere, createdAt: { gte: since } },
        select: productSelect,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }

    // ── best_sellers ──────────────────────────────────────────────────────
    if (opts.strategy === 'best_sellers') {
      const days = opts.windowDays ?? 90;
      const since = new Date();
      since.setDate(since.getDate() - days);

      const orderTotals = await this.prisma.client.orderItem.groupBy({
        by: ['productId'],
        where: {
          product: { shopId: sellerId },
          ...(excludedIds.length ? { productId: { notIn: excludedIds } } : {}),
          order: { createdAt: { gte: since } },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: limit,
      });

      if (orderTotals.length === 0) return [];

      const productIds = orderTotals.map((o) => o.productId);
      const products = await this.prisma.client.product.findMany({
        where: {
          id: { in: productIds },
          ...(priceFilter ? { price: priceFilter } : {}),
        },
        select: productSelect,
      });

      const rankMap = new Map(
        orderTotals.map((o, i) => [
          o.productId,
          { rank: i, totalSold: o._sum.quantity ?? 0 },
        ]),
      );
      return products
        .map((p) => ({ ...p, ...rankMap.get(p.id) }))
        .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    }

    // ── clearance ─────────────────────────────────────────────────────────
    if (opts.strategy === 'clearance') {
      const minDays = opts.minDaysSinceListed ?? 30;
      const maxStk = opts.maxStock ?? 20;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - minDays);

      return this.prisma.client.product.findMany({
        where: {
          ...baseWhere,
          createdAt: { lte: cutoff },
          stockQuantity: { lte: maxStk, gt: 0 },
        },
        select: productSelect,
        orderBy: { createdAt: 'asc' }, // oldest first
        take: limit,
      });
    }

    // ── high_rated ────────────────────────────────────────────────────────
    if (opts.strategy === 'high_rated') {
      const minRating = opts.minRating ?? 4.0;
      const minReviews = opts.minReviews ?? 3;

      // Aggregate review avg per product
      const aggs = await this.prisma.client.review.groupBy({
        by: ['productId'],
        where: {
          product: { shopId: sellerId },
          ...(excludedIds.length ? { productId: { notIn: excludedIds } } : {}),
        },
        _avg: { rating: true },
        _count: { rating: true },
        having: {
          rating: {
            _avg: { gte: minRating },
            _count: { gte: minReviews },
          },
        },
        orderBy: { _avg: { rating: 'desc' } },
        take: limit,
      });

      if (aggs.length === 0) return [];

      const productIds = aggs.map((a) => a.productId);
      const products = await this.prisma.client.product.findMany({
        where: {
          id: { in: productIds },
          ...(priceFilter ? { price: priceFilter } : {}),
        },
        select: productSelect,
      });

      const ratingMap = new Map(
        aggs.map((a) => [
          a.productId,
          {
            avgRating: Math.round((a._avg.rating ?? 0) * 10) / 10,
            reviewCount: a._count.rating,
          },
        ]),
      );
      return products
        .map((p) => ({ ...p, ...ratingMap.get(p.id) }))
        .sort(
          (a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0),
        );
    }

    // ── low_stock ─────────────────────────────────────────────────────────
    if (opts.strategy === 'low_stock') {
      const maxStk = opts.maxStock ?? 10;
      const minStk = opts.minStock ?? 1;

      return this.prisma.client.product.findMany({
        where: {
          ...baseWhere,
          stockQuantity: { lte: maxStk, gte: minStk },
        },
        select: productSelect,
        orderBy: { stockQuantity: 'asc' },
        take: limit,
      });
    }

    // ── price_drop ────────────────────────────────────────────────────────
    if (opts.strategy === 'price_drop') {
      // Surface most recently *updated* products (price is what sellers
      // commonly change) that are not already in the collection.
      const minDays = opts.minDaysSinceListed ?? 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - minDays);

      return this.prisma.client.product.findMany({
        where: {
          ...baseWhere,
          createdAt: { lte: cutoff },  // listed for a while
          updatedAt: {                  // but touched recently
            gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
          },
        },
        select: productSelect,
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
    }

    // Unknown strategy — return empty
    return [];
  }

  /**
   * Bulk-add multiple products to a collection at once
   */
  async bulkAddProducts(
    collectionId: string,
    productIds: string[],
    sellerId: string,
  ): Promise<{ added: number; skipped: number }> {
    if (!sellerId) {
      throw new BadRequestException('Shop context is required to add products to a collection');
    }

    await this.findOne(collectionId, sellerId);

    // Verify all products belong to the seller
    const products = await this.prisma.client.product.findMany({
      where: { id: { in: productIds }, shopId: sellerId },
      select: { id: true },
    });
    const validIds = products.map((p) => p.id);

    // Find already-existing memberships
    const existing = await this.prisma.client.productCollection.findMany({
      where: { collectionId, productId: { in: validIds } },
      select: { productId: true },
    });
    const existingSet = new Set(existing.map((e) => e.productId));
    const toAdd = validIds.filter((id) => !existingSet.has(id));

    if (toAdd.length > 0) {
      await this.prisma.client.productCollection.createMany({
        data: toAdd.map((productId) => ({ productId, collectionId })),
        skipDuplicates: true,
      });
    }

    return { added: toAdd.length, skipped: validIds.length - toAdd.length };
  }

  /**
   * Reorder collections for a seller
   */
  async reorderCollections(
    collectionIds: string[],
    sellerId: string,
  ): Promise<any> {
    // Verify all collections belong to seller
    for (const id of collectionIds) {
      await this.findOne(id, sellerId);
    }

    // Update sort order
    const updates = collectionIds.map((id, index) =>
      this.prisma.client.sellerCollection.update({
        where: { id },
        data: { sortOrder: index },
      }),
    );

    return this.prisma.client.$transaction(updates);
  }
}
