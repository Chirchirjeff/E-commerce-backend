// src/products/products.controller.ts

import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { TenantGuard } from '../auth/tenant.guard';       // FIXED: Relative path mapping
import { JwtAuthGuard } from '../auth/jwt-auth.guard';   // FIXED: Added missing guard import
import { CurrentShopId } from './../current-shop.decorator'; // FIXED: Added missing decorator import
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, TenantGuard) // SECURED: User must be logged in AND own this specific shop
  create(
    @CurrentShopId() shopId: string,
    @CurrentUser() user: { id: string; email: string },
    @Body() createProductDto: CreateProductDto,
  ) {
    return this.productsService.create(createProductDto, shopId, user.id);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  findMine(@CurrentUser() user: { id: string; email: string }) {
    return this.productsService.findMine(user.id);
  }

  @Get()
  findAll() {
    // PUBLIC: Buyers can view products freely without authentication
    return this.productsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) { 
    // PUBLIC: Buyers can view individual products freely without authentication
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, TenantGuard) // SECURED: Restricts modifications to the verified shop owner
  update(
    @Param('id') id: string,
    @CurrentShopId() shopId: string, // Smart move keeping track of the tenant context here!
    @CurrentUser() user: { id: string; email: string },
    @Body() updateProductDto: UpdateProductDto
  ) {
    return this.productsService.update(id, updateProductDto, shopId, user.id);
  }

  // Bonus: Added the missing delete route from your blueprint
  @Delete(':id')
  @UseGuards(JwtAuthGuard, TenantGuard)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
