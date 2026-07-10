// src/shops/dto/create-shop.dto.ts

import { IsOptional, IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateShopDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  name!: string;

  @IsOptional()
  @IsString()
  businessDescription?: string;

  @IsOptional()
  @IsString()
  businessLogo?: string;
}
