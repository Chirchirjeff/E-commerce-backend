import { PartialType } from '@nestjs/mapped-types';
import { CreateSellerCollectionDto } from './create-seller-collection.dto';

export class UpdateSellerCollectionDto extends PartialType(
  CreateSellerCollectionDto,
) {}
