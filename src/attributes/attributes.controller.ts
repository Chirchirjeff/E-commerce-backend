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
import { AttributesService } from './attributes.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';

@Controller('attributes')
@UseGuards(PermissionsGuard)
export class AttributesController {
  constructor(private readonly attributesService: AttributesService) {}

  /**
   * Get all attributes (public read)
   */
  @Get()
  async findAll() {
    return this.attributesService.findAll();
  }

  /**
   * Get attributes by type (public read)
   */
  @Get('type/:type')
  async findByType(@Param('type') type: string) {
    return this.attributesService.findByType(type);
  }

  /**
   * Get attribute by slug (public read)
   */
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    return this.attributesService.findBySlug(slug);
  }

  /**
   * Get category usage of an attribute (admin read)
   */
  @Get(':id/categories')
  async getCategoryUsage(@Param('id') id: string) {
    return this.attributesService.getCategoryUsage(id);
  }

  /**
   * Get single attribute (public read)
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.attributesService.findOne(id);
  }

  /**
   * Create a new attribute (admin only)
   */
  @Post()
  @RequirePermissions('can_manage_attributes')
  async create(@Body() createAttributeDto: CreateAttributeDto) {
    return this.attributesService.create(createAttributeDto);
  }

  /**
   * Update an attribute (admin only)
   */
  @Patch(':id')
  @RequirePermissions('can_manage_attributes')
  async update(
    @Param('id') id: string,
    @Body() updateAttributeDto: UpdateAttributeDto,
  ) {
    return this.attributesService.update(id, updateAttributeDto);
  }

  /**
   * Delete an attribute (admin only, only if not in use)
   */
  @Delete(':id')
  @RequirePermissions('can_manage_attributes')
  async remove(@Param('id') id: string) {
    return this.attributesService.remove(id);
  }
}
