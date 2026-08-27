import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsEmail,
  IsArray,
  ValidateNested,
  Matches,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Order item ───────────────────────────────────────────────────────────────

export class OrderItemPayloadDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @IsPositive()
  price: number;
}

// ─── Order payload (stored in callbackMetadata, used to create Order on success) ─

export class OrderPayloadDto {
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsEmail()
  customerEmail: string;

  @IsString()
  @IsNotEmpty()
  customerPhone: string;

  @IsString()
  @IsNotEmpty()
  deliveryAddress: string;

  @IsString()
  @IsNotEmpty()
  deliveryCity: string;

  @IsString()
  @IsNotEmpty()
  deliveryState: string;

  @IsString()
  @IsNotEmpty()
  deliveryZip: string;

  @IsString()
  @IsNotEmpty()
  shopId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemPayloadDto)
  items: OrderItemPayloadDto[];

  @IsNumber()
  @IsPositive()
  total: number;
}

// ─── Top-level STK push request ───────────────────────────────────────────────

export class InitiateStkPushDto {
  /**
   * The buyer's M-Pesa phone number.
   * Accepted formats: 07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX
   */
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+?254|0)[17]\d{8}$/, {
    message:
      'Phone number must be a valid Kenyan number (e.g. 0712345678 or 254712345678)',
  })
  phoneNumber: string;

  /** Amount to charge — must be a positive integer (Daraja requires whole KES) */
  @IsNumber()
  @IsPositive()
  amount: number;

  /** Full order details — saved as callbackMetadata and used to create the Order on payment success */
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => OrderPayloadDto)
  orderPayload: OrderPayloadDto;
}
