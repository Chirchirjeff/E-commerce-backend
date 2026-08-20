import { PartialType } from '@nestjs/mapped-types';
import { CreateSellerTagDto } from './create-seller-tag.dto';

export class UpdateSellerTagDto extends PartialType(CreateSellerTagDto) {}
