import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards, Query, Req } from '@nestjs/common';
import { ShopsService } from './shops.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('shops')
@UseGuards(PermissionsGuard)
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Get()
  async findAll(@Query('limit') limit?: string, @Query('page') page?: string) {
    return this.shopsService.findAll(
      limit ? parseInt(limit) : 10,
      page ? parseInt(page) : 1,
    );
  }

  /**
   * Get the current seller's own shop(s).
   * Must be declared BEFORE :id to avoid "me" being treated as an ID.
   */
  @Get('me')
  async findMine(@Req() req: any) {
    return this.shopsService.findMine(req.user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.shopsService.findOne(id);
  }

  @Get(':id/stats')
  async getStats(@Param('id') id: string) {
    return this.shopsService.getShopStats(id);
  }

  @Post()
  async create(@Body() createShopDto: any, @CurrentUser() user: any) {
    return this.shopsService.create(createShopDto, user.id);
  }

  @Put(':id')
  @RequirePermissions('can_manage_shops')
  async update(@Param('id') id: string, @Body() updateShopDto: any) {
    return this.shopsService.update(id, updateShopDto);
  }

  /**
   * Partial update — used by use-shop.ts useUpdateShop mutation.
   */
  @Patch(':id')
  async partialUpdate(@Param('id') id: string, @Body() updateShopDto: any, @Req() req: any) {
    return this.shopsService.update(id, updateShopDto);
  }
}