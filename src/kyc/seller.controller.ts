/**
 * SellerController — thin alias layer under /seller for the seller-onboarding
 * frontend. Maps /seller/kyc-status and /seller/kyc-submit to the existing
 * KycService methods so we don't duplicate business logic.
 */
import {
  Controller,
  Get,
  Post,
  Req,
  Body,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { KycService } from './kyc.service';
import { CreateKycDto } from './dto/create-kyc.dto';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  filename?: string;
  path?: string;
  buffer?: Buffer;
}

@Controller('seller')
export class SellerController {
  constructor(private readonly kycService: KycService) {}

  /**
   * GET /seller/kyc-status
   * Returns the current user's KYC status.
   */
  @Get('kyc-status')
  async getKycStatus(@Req() req: any) {
    return this.kycService.getKYCStatus(req.user.id);
  }

  /**
   * POST /seller/kyc-submit
   * Submits KYC documents for the current user.
   * The frontend sends files as separate fields: `idFile` and `businessLicense`.
   */
  @Post('kyc-submit')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'idFile', maxCount: 1 },
      { name: 'businessLicense', maxCount: 1 },
    ]),
  )
  async submitKyc(
    @Req() req: any,
    @Body() createKycDto: CreateKycDto,
    @UploadedFiles()
    files: { idFile?: MulterFile[]; businessLicense?: MulterFile[] },
  ) {
    const idFileArr = files?.idFile;
    const licenseArr = files?.businessLicense;

    if (!idFileArr?.length || !licenseArr?.length) {
      throw new BadRequestException(
        'Please upload both Government ID and Business License',
      );
    }

    const idFileUrl =
      idFileArr[0].filename || idFileArr[0].originalname || 'id-file';
    const businessLicenseUrl =
      licenseArr[0].filename || licenseArr[0].originalname || 'license-file';

    return this.kycService.submitKYC(
      req.user.id,
      createKycDto,
      idFileUrl,
      businessLicenseUrl,
    );
  }
}
