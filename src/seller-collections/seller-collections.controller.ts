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
import { SellerCollectionsService } from './seller-collections.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateSellerCollectionDto } from './dto/create-seller-collection.dto';
import { UpdateSellerCollectionDto } from './dto/update-seller-collection.dto';

@Controller('seller/collections')
@UseGuards(PermissionsGuard)
export class SellerCollectionsController {
  constructor(
    private readonly sellerCollectionsService: SellerCollectionsService,
  ) {}

  /**
   * Get all collections for the current seller
   */
  @Get()
  @RequirePermissions('can_manage_products')
  async findAll(
    @CurrentUser() user: any,
    @Query('includeInactive') includeInactive: string,
  ) {
    const includeInactiveFlag = includeInactive === 'true';
    return this.sellerCollectionsService.findAllBySellerAdmin(
      user.shopId,
      includeInactiveFlag,
    );
  }

  /**
   * Get collection by slug
   */
  @Get('slug/:slug')
  @RequirePermissions('can_manage_products')
  async findBySlug(@Param('slug') slug: string, @CurrentUser() user: any) {
    return this.sellerCollectionsService.findBySlug(slug, user.shopId);
  }

  /**
   * Get products in a collection
   */
  @Get(':id/products')
  @RequirePermissions('can_manage_products')
  async getCollectionProducts(
    @Param('id') collectionId: string,
    @CurrentUser() user: any,
  ) {
    return this.sellerCollectionsService.getCollectionProducts(
      collectionId,
      user.shopId,
    );
  }

  /**
   * Get single collection
   */
  @Get(':id')
  @RequirePermissions('can_manage_products')
  async findOne(@Param('id') collectionId: string, @CurrentUser() user: any) {
    return this.sellerCollectionsService.findOne(collectionId, user.shopId);
  }

  /**
   * Create a new collection
   */
  @Post()
  @RequirePermissions('can_manage_products')
  async create(
    @Body() createCollectionDto: CreateSellerCollectionDto,
    @CurrentUser() user: any,
  ) {
    return this.sellerCollectionsService.create(
      createCollectionDto,
      user.shopId,
    );
  }

  /**
   * Update a collection
   */
  @Patch(':id')
  @RequirePermissions('can_manage_products')
  async update(
    @Param('id') collectionId: string,
    @Body() updateCollectionDto: UpdateSellerCollectionDto,
    @CurrentUser() user: any,
  ) {
    return this.sellerCollectionsService.update(
      collectionId,
      updateCollectionDto,
      user.shopId,
    );
  }

  /**
   * Deactivate a collection
   */
  @Post(':id/deactivate')
  @RequirePermissions('can_manage_products')
  async deactivate(
    @Param('id') collectionId: string,
    @CurrentUser() user: any,
  ) {
    return this.sellerCollectionsService.deactivate(collectionId, user.shopId);
  }

  /**
   * Reactivate a collection
   */
  @Post(':id/activate')
  @RequirePermissions('can_manage_products')
  async activate(@Param('id') collectionId: string, @CurrentUser() user: any) {
    return this.sellerCollectionsService.activate(collectionId, user.shopId);
  }

  /**
   * Delete a collection
   */
  @Delete(':id')
  @RequirePermissions('can_manage_products')
  async remove(
    @Param('id') collectionId: string,
    @CurrentUser() user: any,
  ) {
    return this.sellerCollectionsService.remove(collectionId, user.shopId);
  }

  /**
   * Add a product to a collection
   */
  @Post(':id/products/:productId')
  @RequirePermissions('can_manage_products')
  async addProduct(
    @Param('id') collectionId: string,
    @Param('productId') productId: string,
    @CurrentUser() user: any,
  ) {
    return this.sellerCollectionsService.addProduct(
      collectionId,
      productId,
      user.shopId,
    );
  }

  /**
   * Remove a product from a collection
   */
  @Delete(':id/products/:productId')
  @RequirePermissions('can_manage_products')
  async removeProduct(
    @Param('id') collectionId: string,
    @Param('productId') productId: string,
    @CurrentUser() user: any,
  ) {
    return this.sellerCollectionsService.removeProduct(
      collectionId,
      productId,
      user.shopId,
    );
  }

  /**
   * Reorder collections
   */
  @Post('reorder')
  @RequirePermissions('can_manage_products')
  async reorderCollections(
    @Body() body: { collectionIds: string[] },
    @CurrentUser() user: any,
  ) {
    return this.sellerCollectionsService.reorderCollections(
      body.collectionIds,
      user.shopId,
    );
  }
}
