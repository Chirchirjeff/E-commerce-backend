import { IsOptional, IsString, IsEnum, MinLength, MaxLength } from 'class-validator';

export enum ShopLinkSource {
  INSTAGRAM = 'instagram',
  TIKTOK = 'tiktok',
  FACEBOOK = 'facebook',
  TWITTER = 'twitter',
  WHATSAPP = 'whatsapp',
  EMAIL = 'email',
  OTHER = 'other',
}

export class CreateShopLinkDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(ShopLinkSource)
  source?: ShopLinkSource;
}
