// src/products/products.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../prisma.service';

type NormalizedProductImage = {
  imageUrl: string;
  isPrimary: boolean;
};

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
    if (createProductDto.attributeValues && createProductDto.attributeValues.length > 0) {
      await this.setProductAttributeValues(
        product.id,
        marketplaceCategoryId,
        createProductDto.attributeValues,
      );
    }

    // Add to collections if provided
    if (createProductDto.collectionIds && createProductDto.collectionIds.length > 0) {
      await this.addProductToCollections(
        product.id,
        createProductDto.collectionIds,
        resolvedShopId,
      );
    }

    // Add tags if provided
    if (createProductDto.tagIds && createProductDto.tagIds.length > 0) {
      await this.addProductTags(product.id, createProductDto.tagIds, resolvedShopId);
    }

    // Return complete product with all relations
    return this.findOne(product.id);
  }

  // OPTIONAL BONUS: You could filter global reads by the shopId too if you want isolation on lists
  async findAll(shopId?: string, search?: string) {
    const where: any = {};

    // Filter by shop if provided
    if (shopId) {
      where.shopId = shopId;
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
          : await this.resolveCategoryId(updateProductDto.categoryId, product.shopId);
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
    if (updateProductDto.attributeValues && updateProductDto.attributeValues.length > 0) {
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
      throw new BadRequestException('Cannot assign an inactive marketplace category');
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
    const categoryAttributes = await this.prisma.client.categoryAttribute.findMany({
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
      await this.prisma.client.productCollection.create({
        data: {
          productId,
          collectionId,
        },
      }).catch(() => {
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
      await this.prisma.client.productTag.create({
        data: {
          productId,
          tagId,
        },
      }).catch(() => {
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
