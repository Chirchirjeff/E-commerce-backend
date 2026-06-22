// src/shops/dto/create-shop.dto.ts

import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateShopDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  name!: string;
}