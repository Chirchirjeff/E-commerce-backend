// src/shops/shops.service.ts

import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';

@Injectable()
export class ShopsService {
  constructor(private prisma: PrismaService) {}

  async create(createShopDto: CreateShopDto, userId: string) {
    if (!createShopDto.name?.trim()) {
      throw new ConflictException('Please enter a shop name');
    }

    const existingOwnedShop = await this.prisma.client.shop.findFirst({
      where: { ownerId: userId },
    });

    if (existingOwnedShop) {
      return existingOwnedShop;
    }

    const slug = await this.generateUniqueSlug(createShopDto.name);

    return this.prisma.client.shop.create({
      data: {
        name: createShopDto.name.trim(),
        businessDescription: createShopDto.businessDescription?.trim(),
        businessLogo: createShopDto.businessLogo?.trim(),
        slug,
        ownerId: userId,
      },
    });
  }

  async findAll() {
    // Returns all shops globally (Great for an admin panel or a platform-wide index)
    return this.prisma.client.shop.findMany({
      include: {
        products: { include: { category: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMine(userId: string) {
    return this.prisma.client.shop.findMany({
      where: { ownerId: userId },
      include: { products: { include: { category: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const shop = await this.prisma.client.shop.findUnique({ where: { id } });
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  async findBySlug(slug: string) {
    const shop = await this.prisma.client.shop.findUnique({
      where: { slug: slug.toLowerCase() },
      include: {
        products: { include: { category: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  async update(id: string, updateShopDto: UpdateShopDto) {
    return this.prisma.client.shop.update({
      where: { id },
      data: updateShopDto,
    });
  }

  private async generateUniqueSlug(name: string) {
    const baseSlug = this.slugify(name) || 'shop';
    let slug = baseSlug;
    let suffix = 2;

    while (
      await this.prisma.client.shop.findUnique({
        where: { slug },
        select: { id: true },
      })
    ) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return slug;
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
