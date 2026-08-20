// src/categories/categories.service.ts

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(
    createCategoryDto: CreateCategoryDto,
    shopId: string | undefined,
    userId: string,
  ) {
    const resolvedShopId = await this.resolveShopId(shopId, userId);

    return this.prisma.client.category.create({
      data: {
        name: createCategoryDto.name.trim(),
        shopId: resolvedShopId,
      },
    });
  }

  async findAll(userId: string) {
    // Find the user's shop
    const shop = await this.prisma.client.shop.findFirst({
      where: { ownerId: userId },
      select: { id: true },
    });

    if (!shop) {
      return [];
    }

    // Return only categories for this shop
    return this.prisma.tenantClient.category.findMany({
      where: { shopId: shop.id },
      orderBy: { name: 'asc' },
    });
  }

  // FIXED: Changed id type from number to string to match UUID
  async findOne(id: string) {
    return this.prisma.tenantClient.category.findUnique({
      where: { id },
    });
  }

  // FIXED: Removed the extra closing bracket that was above this method
  // FIXED: Changed id type from number to string
  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    return this.prisma.tenantClient.category.update({
      where: { id },
      data: updateCategoryDto,
    });
  }

  async remove(id: string) {
    return this.prisma.tenantClient.category.delete({
      where: { id },
    });
  }

  private async resolveShopId(shopId: string | undefined, userId: string) {
    if (shopId) {
      const shop = await this.prisma.client.shop.findFirst({
        where: { id: shopId, ownerId: userId },
        select: { id: true },
      });
      if (!shop) {
        throw new NotFoundException('Shop not found for this seller');
      }
      return shop.id;
    }

    const shop = await this.prisma.client.shop.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (!shop) {
      throw new BadRequestException('Create a shop before adding categories');
    }

    return shop.id;
  }
}
