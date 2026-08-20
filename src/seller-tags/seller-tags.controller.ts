import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { SellerTagsService } from './seller-tags.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateSellerTagDto } from './dto/create-seller-tag.dto';
import { UpdateSellerTagDto } from './dto/update-seller-tag.dto';

@Controller('seller/tags')
@UseGuards(PermissionsGuard)
export class SellerTagsController {
  constructor(private readonly sellerTagsService: SellerTagsService) {}

  /**
   * Get all tags for the current seller
   */
  @Get()
  @RequirePermissions('can_manage_products')
  async findAll(@CurrentUser() user: any) {
    return this.sellerTagsService.findAllBySeller(user.shopId);
  }

  /**
   * Search tags by name
   */
  @Get('search')
  @RequirePermissions('can_manage_products')
  async search(@Query('q') query: string, @CurrentUser() user: any) {
    if (!query || query.length < 1) {
      return [];
    }
    return this.sellerTagsService.searchTags(user.shopId, query);
  }

  /**
   * Get tag by slug
   */
  @Get('slug/:slug')
  @RequirePermissions('can_manage_products')
  async findBySlug(@Param('slug') slug: string, @CurrentUser() user: any) {
    return this.sellerTagsService.findBySlug(slug, user.shopId);
  }

  /**
   * Get all products with a tag
   */
  @Get(':id/products')
  @RequirePermissions('can_manage_products')
  async getTaggedProducts(
    @Param('id') tagId: string,
    @CurrentUser() user: any,
  ) {
    return this.sellerTagsService.getTaggedProducts(tagId, user.shopId);
  }

  /**
   * Get single tag
   */
  @Get(':id')
  @RequirePermissions('can_manage_products')
  async findOne(@Param('id') tagId: string, @CurrentUser() user: any) {
    return this.sellerTagsService.findOne(tagId, user.shopId);
  }

  /**
   * Create a new tag
   */
  @Post()
  @RequirePermissions('can_manage_products')
  async create(
    @Body() createTagDto: CreateSellerTagDto,
    @CurrentUser() user: any,
  ) {
    return this.sellerTagsService.create(createTagDto, user.shopId);
  }

  /**
   * Update a tag
   */
  @Patch(':id')
  @RequirePermissions('can_manage_products')
  async update(
    @Param('id') tagId: string,
    @Body() updateTagDto: UpdateSellerTagDto,
    @CurrentUser() user: any,
  ) {
    return this.sellerTagsService.update(tagId, updateTagDto, user.shopId);
  }

  /**
   * Delete a tag
   */
  @Delete(':id')
  @RequirePermissions('can_manage_products')
  async remove(@Param('id') tagId: string, @CurrentUser() user: any) {
    return this.sellerTagsService.remove(tagId, user.shopId);
  }

  /**
   * Add a tag to a product
   */
  @Post(':id/products/:productId')
  @RequirePermissions('can_manage_products')
  async addToProduct(
    @Param('id') tagId: string,
    @Param('productId') productId: string,
    @CurrentUser() user: any,
  ) {
    return this.sellerTagsService.addToProduct(tagId, productId, user.shopId);
  }

  /**
   * Remove a tag from a product
   */
  @Delete(':id/products/:productId')
  @RequirePermissions('can_manage_products')
  async removeFromProduct(
    @Param('id') tagId: string,
    @Param('productId') productId: string,
    @CurrentUser() user: any,
  ) {
    return this.sellerTagsService.removeFromProduct(
      tagId,
      productId,
      user.shopId,
    );
  }

  /**
   * Add multiple tags to a product
   */
  @Post('products/:productId/bulk-add')
  @RequirePermissions('can_manage_products')
  async addTagsToProduct(
    @Param('productId') productId: string,
    @Body() body: { tagIds: string[] },
    @CurrentUser() user: any,
  ) {
    return this.sellerTagsService.addTagsToProduct(
      productId,
      body.tagIds,
      user.shopId,
    );
  }

  /**
   * Get tags for a product
   */
  @Get('products/:productId')
  @RequirePermissions('can_manage_products')
  async getProductTags(
    @Param('productId') productId: string,
    @CurrentUser() user: any,
  ) {
    return this.sellerTagsService.getProductTags(productId, user.shopId);
  }
}
