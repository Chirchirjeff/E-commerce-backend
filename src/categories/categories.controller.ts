// src/categories/categories.controller.ts

import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CurrentShopId } from './../current-shop.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // Added: JWT protection guard
import { TenantGuard } from '../auth/tenant.guard';   // Added: Store ownership cross-verification guard
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, TenantGuard) // SECURED: User must be logged in AND own this specific shop
  create(
    @CurrentShopId() shopId: string | undefined,
    @CurrentUser() user: { id: string; email: string },
    @Body() createCategoryDto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(createCategoryDto, shopId, user.id);
  }

  @Get()
  findAll() {
    // PUBLIC: Buyers can view categories freely without authentication
    return this.categoriesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) { 
    // PUBLIC: Buyers can view individual categories freely without authentication
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, TenantGuard) // SECURED: Restricts modifications to the verified shop owner
  update(
    @Param('id') id: string, 
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, TenantGuard) // SECURED: Prevents rival vendors from deleting catalog records
  remove(@Param('id') id: string) { 
    return this.categoriesService.remove(id);
  }
}
