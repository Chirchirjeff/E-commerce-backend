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

    const payload = {
      name: createProductDto.name,
      description: createProductDto.description,
      price: createProductDto.price,
      stockQuantity: createProductDto.stockQuantity ?? 0,
      shopId: resolvedShopId,
      categoryId: await this.resolveCategoryId(
        createProductDto.categoryId,
        resolvedShopId,
      ),
      thumbnailUrl: createProductDto.thumbnailUrl,
      images: this.normalizeImages(
        createProductDto.imageUrls ?? createProductDto.images,
      ),
    };

    return this.prisma.client.product.create({
      data: payload,
      include: { category: true, shop: true },
    });
  }

  // OPTIONAL BONUS: You could filter global reads by the shopId too if you want isolation on lists
  async findAll() {
    return this.prisma.client.product.findMany({
      include: { category: true, shop: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMine(userId: string) {
    return this.prisma.client.product.findMany({
      where: { shop: { ownerId: userId } },
      include: { category: true, shop: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // FIXED: Expects id to be a string (UUID) instead of a number
  async findOne(id: string) {
    const product = await this.prisma.client.product.findUnique({
      where: { id },
      include: { category: true, shop: true },
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

    const payload = {
      name: updateProductDto.name,
      description: updateProductDto.description,
      price: updateProductDto.price,
      stockQuantity: updateProductDto.stockQuantity,
      categoryId:
        updateProductDto.categoryId === undefined
          ? undefined
          : await this.resolveCategoryId(updateProductDto.categoryId, product.shopId),
      thumbnailUrl: updateProductDto.thumbnailUrl,
      images: this.normalizeImages(
        updateProductDto.imageUrls ?? updateProductDto.images,
      ),
    };

    return this.prisma.client.product.update({
      where: { id },
      data: payload,
      include: { category: true, shop: true },
    });
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
}
