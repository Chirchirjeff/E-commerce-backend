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
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { KycService } from './kyc.service';
import { CreateKycDto } from './dto/create-kyc.dto';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const kycStorage = diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const rnd = randomBytes(6).toString('hex');
    const name = `${Date.now()}-${rnd}${extname(file.originalname)}`;
    cb(null, name);
  },
});

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
    FileFieldsInterceptor(
      [
        { name: 'idFile', maxCount: 1 },
        { name: 'businessLicense', maxCount: 1 },
      ],
      { storage: kycStorage },
    ),
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

    // Store just the generated filename — frontend reconstructs the full URL
    // via NEXT_PUBLIC_API_URL + /uploads/<filename>
    const idFileUrl = idFileArr[0].filename!;
    const businessLicenseUrl = licenseArr[0].filename!;

    return this.kycService.submitKYC(
      req.user.id,
      createKycDto,
      idFileUrl,
      businessLicenseUrl,
    );
  }
}
