import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsUUID,
  IsInt,
} from 'class-validator';

export class CreateMarketplaceCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, {
    message: 'Category name must be at least 2 characters long',
  })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2, {
    message: 'Category slug must be at least 2 characters long',
  })
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
