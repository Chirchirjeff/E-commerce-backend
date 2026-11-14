/**
 * SellerController — thin alias layer under /seller for the seller-onboarding
 * frontend. Maps /seller/kyc-status and /seller/kyc-submit to the existing
 * KycService methods so we don't duplicate business logic.
 *
 * Files are held in memory by multer and uploaded to Cloudinary immediately —
 * no disk writes, works correctly on ephemeral Render instances.
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
import { memoryStorage } from 'multer';
import { KycService } from './kyc.service';
import { CreateKycDto } from './dto/create-kyc.dto';
import { uploadToCloudinary } from '../lib/cloudinary';

const KYC_FOLDER = process.env.CLOUDINARY_FOLDER
  ? `${process.env.CLOUDINARY_FOLDER}/kyc`
  : 'quza/kyc';

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
      {
        storage: memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
        fileFilter: (_req, file, cb) => {
          const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
          if (!allowed.includes(file.mimetype)) {
            return cb(
              new BadRequestException('Only JPG, PNG, WebP or PDF files are accepted') as any,
              false,
            );
          }
          cb(null, true);
        },
      },
    ),
  )
  async submitKyc(
    @Req() req: any,
    @Body() createKycDto: CreateKycDto,
    @UploadedFiles()
    files: { idFile?: Express.Multer.File[]; businessLicense?: Express.Multer.File[] },
  ) {
    const idFileArr = files?.idFile;
    const licenseArr = files?.businessLicense;

    if (!idFileArr?.length || !licenseArr?.length) {
      throw new BadRequestException(
        'Please upload both Government ID and Business License',
      );
    }

    const idFile = idFileArr[0];
    const licenseFile = licenseArr[0];

    // Upload both files to Cloudinary in parallel — returns permanent secure_urls
    const [idFileUrl, businessLicenseUrl] = await Promise.all([
      uploadToCloudinary(idFile.buffer, KYC_FOLDER, idFile.mimetype),
      uploadToCloudinary(licenseFile.buffer, KYC_FOLDER, licenseFile.mimetype),
    ]);

    return this.kycService.submitKYC(
      req.user.id,
      createKycDto,
      idFileUrl,
      businessLicenseUrl,
    );
  }
}
