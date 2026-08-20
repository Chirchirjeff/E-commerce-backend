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
