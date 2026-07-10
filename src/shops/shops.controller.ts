// src/shops/shops.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ShopsService } from './shops.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('shops')
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Post()
  @UseGuards(JwtAuthGuard) // Guarded: Must have an active JWT login session
  create(
    @Body() createShopDto: CreateShopDto,
    @CurrentUser() user: { id: string; email: string },
  ) {
    // Pass down the verified user ID as the owner
    return this.shopsService.create(createShopDto, user.id);
  }

  @Get()
  findAll() {
    return this.shopsService.findAll();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  findMine(@CurrentUser() user: { id: string; email: string }) {
    return this.shopsService.findMine(user.id);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.shopsService.findBySlug(slug);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.shopsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateShopDto: UpdateShopDto,
    @CurrentUser() user: { id: string; email: string },
  ) {
    const shop = await this.shopsService.findOne(id);
    if (shop.ownerId !== user.id) {
      throw new ForbiddenException('You do not own this shop');
    }

    return this.shopsService.update(id, updateShopDto);
  }
}
