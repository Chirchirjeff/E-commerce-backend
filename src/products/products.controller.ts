import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipGuard } from '../auth/decorators/skip-guard.decorator';
import {
  ProductSuggestionsDto,
  SearchProductsDto,
} from './dto/search-products.dto';

@Controller('products')
@UseGuards(PermissionsGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @SkipGuard()
  async findAll(
    @Query('shopId') shopId?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.productsService.findAll(shopId, search, categoryId);
  }

  @Get('mine')
  @RequirePermissions('can_manage_products')
  async findMine(@CurrentUser() user: any) {
    return this.productsService.findMine(user.id);
  }

  @Get('search/suggestions')
  @SkipGuard()
  async suggestions(@Query() query: ProductSuggestionsDto) {
    return this.productsService.suggestions(query);
  }

  @Get('search')
  @SkipGuard()
  async search(@Query() query: SearchProductsDto) {
    return this.productsService.search(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @RequirePermissions('can_manage_products')
  async create(@CurrentUser() user: any, @Body() createProductDto: any) {
    return this.productsService.create(createProductDto, user.shopId, user.id);
  }

  @Put(':id')
  @RequirePermissions('can_manage_products')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateProductDto: any,
  ) {
    return this.productsService.update(
      id,
      updateProductDto,
      user.shopId,
      user.id,
    );
  }

  @Delete(':id')
  @RequirePermissions('can_manage_products')
  async remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
