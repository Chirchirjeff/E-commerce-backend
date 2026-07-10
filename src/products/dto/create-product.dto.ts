import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min, MinLength, IsArray } from 'class-validator';

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

  @IsOptional()
  @IsString()
  status?: string;
}
