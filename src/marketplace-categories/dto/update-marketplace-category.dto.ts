import { PartialType } from '@nestjs/mapped-types';
import { CreateMarketplaceCategoryDto } from './create-marketplace-category.dto';

export class UpdateMarketplaceCategoryDto extends PartialType(
  CreateMarketplaceCategoryDto,
) {}
