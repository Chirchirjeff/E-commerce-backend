// src/kyc/dto/review-kyc.dto.ts
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ReviewKycDto {
  @IsString()
  @IsOptional()
  action?: 'approve' | 'reject';

  @IsString()
  @IsOptional()
  comment?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}