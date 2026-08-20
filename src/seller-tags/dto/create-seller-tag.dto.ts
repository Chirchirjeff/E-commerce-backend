import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
} from 'class-validator';

export class CreateSellerTagDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1, {
    message: 'Tag name must be at least 1 character',
  })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1, {
    message: 'Tag slug must be at least 1 character',
  })
  slug!: string;

  @IsOptional()
  @IsString()
  color?: string; // Optional hex color for UI display
}
