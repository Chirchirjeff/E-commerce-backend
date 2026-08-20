import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsInt,
} from 'class-validator';

export class CreateSellerCollectionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, {
    message: 'Collection name must be at least 2 characters',
  })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2, {
    message: 'Collection slug must be at least 2 characters',
  })
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
