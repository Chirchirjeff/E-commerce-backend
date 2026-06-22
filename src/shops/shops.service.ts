// src/shops/shops.service.ts

import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';

@Injectable()
export class ShopsService {
  constructor(private prisma: PrismaService) {}

  async create(createShopDto: CreateShopDto, userId: string) {
    // 1. Generate a URL-friendly slug from the store name
    // e.g., "Tech Haven & Co!" -> "tech-haven-co"
    const slug = createShopDto.name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with a single hyphen
      .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens

    // 2. Ensure the subdomain slug is completely unique on the platform
    const existingShop = await this.prisma.client.shop.findUnique({
      where: { slug },
    });

    if (existingShop) {
      throw new ConflictException(`The store address name "${slug}" is already taken.`);
    }

    // 3. Create the shop record tied to the registering user
    return this.prisma.client.shop.create({
      data: {
        name: createShopDto.name,
        slug,
        ownerId: userId,
      },
    });
  }

  async findAll() {
    // Returns all shops globally (Great for an admin panel or a platform-wide index)
    return this.prisma.client.shop.findMany();
  }

  async findOne(id: string) {
    const shop = await this.prisma.client.shop.findUnique({ where: { id } });
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  async update(id: string, updateShopDto: UpdateShopDto) {
    return this.prisma.client.shop.update({
      where: { id },
      data: updateShopDto,
    });
  }
}