// src/products/products.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  // FIXED: Added shopId parameter to secure the record footprint
  async create(createProductDto: CreateProductDto, shopId: string) {
    return this.prisma.client.product.create({
      data: {
        ...createProductDto,
        shopId, // Locks this product to the current store tenant
      },
    });
  }

  // OPTIONAL BONUS: You could filter global reads by the shopId too if you want isolation on lists
  async findAll() {
    return this.prisma.client.product.findMany();
  }

  // FIXED: Expects id to be a string (UUID) instead of a number
  async findOne(id: string) {
    const product = await this.prisma.client.product.findUnique({
      where: { id },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  // FIXED: Expects a string id and accepts the cross-verifying shopId footprint
  async update(id: string, updateProductDto: UpdateProductDto, shopId: string) {
    // First ensure the product exists and belongs to this shop
    const product = await this.prisma.client.product.findFirst({
      where: { id, shopId },
    });

    if (!product) {
      throw new NotFoundException('Product not found in this storefront location');
    }

    return this.prisma.client.product.update({
      where: { id },
      data: updateProductDto,
    });
  }

  // FIXED: Expects id to be a string (UUID) instead of a number
  async remove(id: string) {
    return this.prisma.client.product.delete({
      where: { id },
    });
  }
}