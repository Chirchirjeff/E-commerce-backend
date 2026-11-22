import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdateOrderDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsNumber()
  @IsOptional()
  total?: number;
}

/** Fields a buyer may update on their own order after payment. */
export class UpdateDeliveryDto {
  @IsString()
  @IsOptional()
  deliveryAddress?: string;

  @IsString()
  @IsOptional()
  deliveryCity?: string;

  @IsString()
  @IsOptional()
  deliveryState?: string;

  @IsString()
  @IsOptional()
  deliveryZip?: string;

  @IsString()
  @IsOptional()
  deliveryName?: string;

  @IsString()
  @IsOptional()
  deliveryPhone?: string;

  @IsString()
  @IsOptional()
  deliveryEmail?: string;
}
