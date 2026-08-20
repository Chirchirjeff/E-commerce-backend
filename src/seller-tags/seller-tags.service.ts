import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateSellerTagDto } from './dto/create-seller-tag.dto';
import { UpdateSellerTagDto } from './dto/update-seller-tag.dto';

@Injectable()
export class SellerTagsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a seller tag
   */
  async create(
    createTagDto: CreateSellerTagDto,
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

    // Check slug uniqueness within seller's tags
    const existingSlug = await this.prisma.client.sellerTag.findUnique({
      where: {
        sellerId_slug: {
          sellerId,
          slug: createTagDto.slug,
        },
      },
      select: { id: true },
    });

    if (existingSlug) {
      throw new BadRequestException(
        'Tag slug must be unique within your store',
      );
    }

    return this.prisma.client.sellerTag.create({
      data: {
        sellerId,
        name: createTagDto.name,
        slug: createTagDto.slug,
        color: createTagDto.color,
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
  }

  /**
   * Get all tags for a seller
   */
  async findAllBySeller(sellerId: string): Promise<any[]> {
    return this.prisma.client.sellerTag.findMany({
      where: { sellerId },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
  }

  /**
   * Get a single tag
   */
  async findOne(tagId: string, sellerId?: string): Promise<any> {
    const tag = await this.prisma.client.sellerTag.findUnique({
      where: { id: tagId },
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

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    // Check ownership if sellerId provided
    if (sellerId && tag.sellerId !== sellerId) {
      throw new ForbiddenException('You do not have access to this tag');
    }

    return tag;
  }

  /**
   * Get tag by slug (for a specific seller)
   */
  async findBySlug(slug: string, sellerId: string): Promise<any> {
    const tag = await this.prisma.client.sellerTag.findUnique({
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
              },
            },
          },
        },
        _count: {
          select: { products: true },
        },
      },
    });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return tag;
  }

  /**
   * Update a seller tag
   */
  async update(
    tagId: string,
    updateTagDto: UpdateSellerTagDto,
    sellerId: string,
  ): Promise<any> {
    const tag = await this.findOne(tagId, sellerId);

    // Check slug uniqueness if updating slug
    if (updateTagDto.slug && updateTagDto.slug !== tag.slug) {
      const existingSlug = await this.prisma.client.sellerTag.findUnique({
        where: {
          sellerId_slug: {
            sellerId,
            slug: updateTagDto.slug,
          },
        },
        select: { id: true },
      });

      if (existingSlug) {
        throw new BadRequestException('Tag slug must be unique within your store');
      }
    }

    const updateData: any = {};
    if (updateTagDto.name) updateData.name = updateTagDto.name;
    if (updateTagDto.slug) updateData.slug = updateTagDto.slug;
    if (updateTagDto.color !== undefined) updateData.color = updateTagDto.color;

    return this.prisma.client.sellerTag.update({
      where: { id: tagId },
      data: updateData,
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
  }

  /**
   * Delete a tag
   */
  async remove(tagId: string, sellerId: string): Promise<any> {
    const tag = await this.findOne(tagId, sellerId);

    // Check if tag has products
    const productCount = await this.prisma.client.productTag.count({
      where: { tagId },
    });

    if (productCount > 0) {
      throw new BadRequestException(
        `Cannot delete tag with ${productCount} product(s). Remove tag from products first.`,
      );
    }

    return this.prisma.client.sellerTag.delete({
      where: { id: tagId },
    });
  }

  /**
   * Add a tag to a product
   */
  async addToProduct(
    tagId: string,
    productId: string,
    sellerId: string,
  ): Promise<any> {
    // Verify tag belongs to seller
    const tag = await this.findOne(tagId, sellerId);

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

    // Check if product already has this tag
    const existing = await this.prisma.client.productTag.findUnique({
      where: {
        productId_tagId: {
          productId,
          tagId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Product already has this tag');
    }

    return this.prisma.client.productTag.create({
      data: {
        productId,
        tagId,
      },
      include: {
        tag: true,
        product: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Remove a tag from a product
   */
  async removeFromProduct(
    tagId: string,
    productId: string,
    sellerId: string,
  ): Promise<any> {
    // Verify tag belongs to seller
    await this.findOne(tagId, sellerId);

    const productTag = await this.prisma.client.productTag.findUnique({
      where: {
        productId_tagId: {
          productId,
          tagId,
        },
      },
    });

    if (!productTag) {
      throw new NotFoundException('Product does not have this tag');
    }

    return this.prisma.client.productTag.delete({
      where: {
        productId_tagId: {
          productId,
          tagId,
        },
      },
    });
  }

  /**
   * Get all products with a specific tag
   */
  async getTaggedProducts(tagId: string, sellerId?: string): Promise<any[]> {
    // Verify tag exists
    const tag = await this.findOne(tagId, sellerId);

    return this.prisma.client.productTag.findMany({
      where: { tagId },
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
   * Get all tags for a product
   */
  async getProductTags(productId: string, sellerId?: string): Promise<any[]> {
    // Verify product exists
    const product = await this.prisma.client.product.findUnique({
      where: { id: productId },
      select: { id: true, shopId: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (sellerId && product.shopId !== sellerId) {
      throw new ForbiddenException('Product does not belong to your store');
    }

    return this.prisma.client.productTag.findMany({
      where: { productId },
      include: {
        tag: true,
      },
      orderBy: { tag: { name: 'asc' } },
    });
  }

  /**
   * Bulk add tags to a product
   */
  async addTagsToProduct(
    productId: string,
    tagIds: string[],
    sellerId: string,
  ): Promise<any> {
    // Verify product belongs to seller
    const product = await this.prisma.client.product.findUnique({
      where: { id: productId },
      select: { shopId: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.shopId !== sellerId) {
      throw new ForbiddenException('Product does not belong to your store');
    }

    // Verify all tags belong to seller
    for (const tagId of tagIds) {
      await this.findOne(tagId, sellerId);
    }

    // Remove existing tags
    await this.prisma.client.productTag.deleteMany({
      where: { productId },
    });

    // Add new tags
    const operations = tagIds.map((tagId) =>
      this.prisma.client.productTag.create({
        data: {
          productId,
          tagId,
        },
      }),
    );

    return this.prisma.client.$transaction(operations);
  }

  /**
   * Search tags by name
   */
  async searchTags(sellerId: string, query: string): Promise<any[]> {
    return this.prisma.client.sellerTag.findMany({
      where: {
        sellerId,
        name: {
          contains: query,
          mode: 'insensitive',
        },
      },
      orderBy: { name: 'asc' },
      take: 20,
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
  }
}
