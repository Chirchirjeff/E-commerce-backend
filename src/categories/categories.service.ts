// src/categories/categories.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto, shopId: string) {
    return this.prisma.client.category.create({
      data: {
        name: createCategoryDto.name,
        shopId: shopId,
      },
    });
  }

  async findAll() {
    return this.prisma.tenantClient.category.findMany();
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
}