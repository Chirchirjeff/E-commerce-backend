import { PartialType } from '@nestjs/mapped-types';
import { CreateShopDto } from './create-shop.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateShopDto extends PartialType(CreateShopDto) {
	@IsOptional()
	@IsString()
	businessDescription?: string;

	@IsOptional()
	@IsString()
	businessLogo?: string;

	@IsOptional()
	@IsString()
	coverPhoto?: string;
}
