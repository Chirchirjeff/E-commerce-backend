// src/kyc/dto/update-kyc.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateKycDto } from './create-kyc.dto';
import { KYCStatus } from '@prisma/client';
import { IsOptional, IsString, IsEnum } from 'class-validator';

export class UpdateKycDto extends PartialType(CreateKycDto) {
  @IsEnum(KYCStatus)
  @IsOptional()
  status?: KYCStatus;

  @IsString()
  @IsOptional()
  message?: string;
}