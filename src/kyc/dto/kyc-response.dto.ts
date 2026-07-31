// src/kyc/dto/kyc-response.dto.ts
import { KYCStatus } from '@prisma/client';

export class KYCResponseDto {
  id?: string;
  userId: string;
  businessName: string;
  businessAddress: string;
  taxId: string;
  phone: string;
  description?: string;
  idFile: string;
  businessLicense: string;
  status: KYCStatus;
  message?: string;
  submittedAt: Date;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}