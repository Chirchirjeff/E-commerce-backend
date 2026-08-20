import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards, Query, Req } from '@nestjs/common';
import { ShopsService } from './shops.service';
import { ShopLinksService } from './shop-links.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipGuard } from '../auth/decorators/skip-guard.decorator';
import { CreateShopLinkDto } from './dto/create-shop-link.dto';

@Controller('shops')
@UseGuards(PermissionsGuard)
export class ShopsController {
  constructor(
    private readonly shopsService: ShopsService,
    private readonly shopLinksService: ShopLinksService,
  ) {}

  @Get()
  @SkipGuard()
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

  @Post()
  async create(@Body() createShopDto: any, @CurrentUser() user: any) {
    return this.shopsService.create(createShopDto, user.id);
  }

  // ========================================
  // SHOP LINKS ENDPOINTS (BEFORE DYNAMIC :id)
  // ========================================

  /**
   * Create a new shop link for social media sharing
   * POST /shops/:shopId/links
   */
  @Post(':shopId/links')
  async createShopLink(
    @Param('shopId') shopId: string,
    @Body() createShopLinkDto: CreateShopLinkDto,
    @CurrentUser() user: any,
  ) {
    return this.shopLinksService.createShopLink(shopId, user.id, createShopLinkDto);
  }

  /**
   * Get all links for a shop
   * GET /shops/:shopId/links?isActive=true
   */
  @Get(':shopId/links')
  async getShopLinks(
    @Param('shopId') shopId: string,
    @CurrentUser() user: any,
    @Query('isActive') isActive?: string,
  ) {
    const isActiveFlag = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.shopLinksService.getShopLinks(shopId, user.id, isActiveFlag);
  }

  /**
   * Get all analytics for a shop's links
   * GET /shops/:shopId/analytics
   */
  @Get(':shopId/analytics')
  async getShopLinksAnalytics(
    @Param('shopId') shopId: string,
    @CurrentUser() user: any,
  ) {
    return this.shopLinksService.getShopLinksAnalytics(shopId, user.id);
  }

  /**
   * Get a specific shop link by ID
   * GET /shops/:shopId/links/:linkId
   */
  @Get(':shopId/links/:linkId')
  async getShopLink(
    @Param('linkId') linkId: string,
    @CurrentUser() user: any,
  ) {
    return this.shopLinksService.getShopLink(linkId, user.id);
  }

  /**
   * Get analytics for a specific shop link
   * GET /shops/:shopId/links/:linkId/analytics
   */
  @Get(':shopId/links/:linkId/analytics')
  async getLinkAnalytics(
    @Param('linkId') linkId: string,
    @CurrentUser() user: any,
  ) {
    return this.shopLinksService.getLinkAnalytics(linkId, user.id);
  }

  /**
   * Update a shop link
   * PATCH /shops/:shopId/links/:linkId
   */
  @Patch(':shopId/links/:linkId')
  async updateShopLink(
    @Param('linkId') linkId: string,
    @Body() updateData: Partial<CreateShopLinkDto>,
    @CurrentUser() user: any,
  ) {
    return this.shopLinksService.updateShopLink(linkId, user.id, updateData);
  }

  /**
   * Toggle link active status
   * PATCH /shops/:shopId/links/:linkId/toggle
   */
  @Patch(':shopId/links/:linkId/toggle')
  async toggleLinkStatus(
    @Param('linkId') linkId: string,
    @CurrentUser() user: any,
  ) {
    return this.shopLinksService.toggleLinkStatus(linkId, user.id);
  }

  /**
   * Delete a shop link
   * DELETE /shops/:shopId/links/:linkId
   */
  @Delete(':shopId/links/:linkId')
  async deleteShopLink(
    @Param('linkId') linkId: string,
    @CurrentUser() user: any,
  ) {
    await this.shopLinksService.deleteShopLink(linkId, user.id);
    return { message: 'Shop link deleted successfully' };
  }

  // ========================================
  // DYNAMIC :id ROUTES (AFTER SPECIFIC ROUTES)
  // ========================================

  @Get(':id/stats')
  async getStats(@Param('id') id: string) {
    return this.shopsService.getShopStats(id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.shopsService.findOne(id);
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