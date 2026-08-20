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
import { MarketplaceCategoriesService } from './marketplace-categories.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CreateMarketplaceCategoryDto } from './dto/create-marketplace-category.dto';
import { UpdateMarketplaceCategoryDto } from './dto/update-marketplace-category.dto';
import { CreateCategoryAttributeDto } from './dto/create-category-attribute.dto';

@Controller('marketplace-categories')
@UseGuards(PermissionsGuard)
export class MarketplaceCategoriesController {
  constructor(
    private readonly marketplaceCategoriesService: MarketplaceCategoriesService,
  ) {}

  /**
   * Get all categories with hierarchical structure (public read)
   */
  @Get()
  async findAll(
    @Query('includeInactive') includeInactive: string,
    @Query('tree') tree: string,
  ) {
    const includeInactiveFlag = includeInactive === 'true';

    if (tree === 'true') {
      return this.marketplaceCategoriesService.findAllWithHierarchy(
        includeInactiveFlag,
      );
    }

    return this.marketplaceCategoriesService.findAll(includeInactiveFlag);
  }

  /**
   * Get category by slug (public read)
   */
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    return this.marketplaceCategoriesService.findBySlug(slug);
  }

  /**
   * Get category breadcrumb path (public read)
   */
  @Get(':id/breadcrumb')
  async getBreadcrumb(@Param('id') id: string) {
    return this.marketplaceCategoriesService.getCategoryBreadcrumb(id);
  }

  /**
   * Get all products in a category (public read)
   */
  @Get(':id/products')
  async getCategoryProducts(
    @Param('id') id: string,
    @Query('includeChildren') includeChildren: string,
  ) {
    const includeChildrenFlag = includeChildren !== 'false';
    return this.marketplaceCategoriesService.getCategoryProducts(
      id,
      includeChildrenFlag,
    );
  }

  /**
   * Get single category with details (public read)
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.marketplaceCategoriesService.findOne(id);
  }

  /**
   * Create a new marketplace category (admin only)
   */
  @Post()
  @RequirePermissions('can_manage_marketplace_categories')
  async create(@Body() createCategoryDto: CreateMarketplaceCategoryDto) {
    return this.marketplaceCategoriesService.create(createCategoryDto);
  }

  /**
   * Update a marketplace category (admin only)
   */
  @Patch(':id')
  @RequirePermissions('can_manage_marketplace_categories')
  async update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateMarketplaceCategoryDto,
  ) {
    return this.marketplaceCategoriesService.update(id, updateCategoryDto);
  }

  /**
   * Deactivate a category (soft delete) (admin only)
   */
  @Post(':id/deactivate')
  @RequirePermissions('can_manage_marketplace_categories')
  async deactivate(@Param('id') id: string) {
    return this.marketplaceCategoriesService.deactivate(id);
  }

  /**
   * Reactivate a category (admin only)
   */
  @Post(':id/activate')
  @RequirePermissions('can_manage_marketplace_categories')
  async activate(@Param('id') id: string) {
    return this.marketplaceCategoriesService.activate(id);
  }

  /**
   * Add an attribute to a category (admin only)
   */
  @Post(':id/attributes')
  @RequirePermissions('can_manage_attributes')
  async addAttribute(
    @Param('id') categoryId: string,
    @Body() createCategoryAttributeDto: CreateCategoryAttributeDto,
  ) {
    return this.marketplaceCategoriesService.addAttribute(
      categoryId,
      createCategoryAttributeDto,
    );
  }

  /**
   * Remove an attribute from a category (admin only)
   */
  @Delete(':id/attributes/:attributeId')
  @RequirePermissions('can_manage_attributes')
  async removeAttribute(
    @Param('id') categoryId: string,
    @Param('attributeId') attributeId: string,
  ) {
    return this.marketplaceCategoriesService.removeAttribute(
      categoryId,
      attributeId,
    );
  }

  /**
   * Update category attribute settings (admin only)
   */
  @Patch(':id/attributes/:attributeId')
  @RequirePermissions('can_manage_attributes')
  async updateCategoryAttribute(
    @Param('id') categoryId: string,
    @Param('attributeId') attributeId: string,
    @Body() updateData: Partial<CreateCategoryAttributeDto>,
  ) {
    return this.marketplaceCategoriesService.updateCategoryAttribute(
      categoryId,
      attributeId,
      updateData,
    );
  }

  /**
   * Reorder categories (admin only)
   */
  @Post('reorder')
  @RequirePermissions('can_manage_marketplace_categories')
  async reorderCategories(@Body() body: { categoryIds: string[] }) {
    return this.marketplaceCategoriesService.reorderCategories(
      body.categoryIds,
    );
  }
}
