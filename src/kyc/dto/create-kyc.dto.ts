import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  MinLength,
} from 'class-validator';

export class CreateKycDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  businessName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  businessAddress: string;

  @IsString()
  @IsNotEmpty()
  taxId: string;

  @IsString()
  @IsNotEmpty()
  @IsPhoneNumber()
  phone: string;

  @IsString()
  @IsOptional()
  description?: string;

  // These are populated by the controller after extracting uploaded files;
  // they won't arrive as body fields but the DTO must allow them to pass through.
  @IsString()
  @IsOptional()
  idFile?: string;

  @IsString()
  @IsOptional()
  businessLicense?: string;
}