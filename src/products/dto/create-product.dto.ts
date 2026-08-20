import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min, MinLength, IsArray, IsUUID, ValidateNested } from 'class-validator';

class AttributeValueDto {
  @IsUUID()
  attributeId!: string;

  @IsString()
  value!: string;
}

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  shopId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockQuantity?: number;

  // NEW: Marketplace category (required)
  @IsUUID()
  @IsOptional()
  marketplaceCategoryId?: string;

  // LEGACY: Shop-scoped category (deprecated)
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];

  // NEW: Attribute values
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeValueDto)
  attributeValues?: AttributeValueDto[];

  // NEW: Collection IDs
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  collectionIds?: string[];

  // NEW: Tag IDs
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsString()
  status?: string;
}
