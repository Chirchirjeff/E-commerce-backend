// src/kyc/kyc.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  ForbiddenException,
  Query,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { KycService } from './kyc.service';

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
import { CreateKycDto } from './dto/create-kyc.dto';
import { UpdateKycDto } from './dto/update-kyc.dto';
import { ReviewKycDto } from './dto/review-kyc.dto';
// Import from the correct locations
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // Your existing guard
import { RolesGuard } from '../auth//guards/roles.guard'; // Your existing guard
import { Roles } from '../auth/decorators/roles.decorator';

// Define MulterFile type to avoid Express namespace issues
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  filename: string;
  path: string;
  buffer?: Buffer;
}

@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  /**
   * Submit KYC
   */
  @Post('submit')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('files', 2, { storage: kycStorage }))
  async submitKYC(
    @Req() req: any,
    @Body() createKycDto: CreateKycDto,
    @UploadedFiles() files: MulterFile[],
  ) {
    const userId = req.user.id;

    if (!files || files.length < 2) {
      throw new BadRequestException(
        'Please upload both Government ID and Business License',
      );
    }

    // Store just the filename — the service layer and frontend reconstruct the
    // full URL via NEXT_PUBLIC_API_URL + /uploads/<filename>
    const idFileUrl = files[0].filename;
    const businessLicenseUrl = files[1].filename;

    return this.kycService.submitKYC(
      userId,
      createKycDto,
      idFileUrl,
      businessLicenseUrl,
    );
  }

  /**
   * Get my KYC status
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyKYC(@Req() req: any) {
    const userId = req.user.id;
    return this.kycService.getKYCStatus(userId);
  }

  /**
   * Get KYC by ID - Admin only
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getKYCById(@Param('id') id: string) {
    return this.kycService.getKYCById(id);
  }

  /**
   * Get KYC by user ID - Admin only
   */
  @Get('user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getKYCByUserId(@Param('userId') userId: string) {
    return this.kycService.getKYCByUserId(userId);
  }

  /**
   * Update KYC - Admin only
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async updateKYC(
    @Param('id') id: string,
    @Body() updateKycDto: UpdateKycDto,
  ) {
    return this.kycService.updateKYC(id, updateKycDto);
  }

  /**
   * Approve KYC - Admin only
   */
  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async approveKYC(
    @Param('id') id: string,
    @Req() req: any,
    @Body() reviewKycDto: ReviewKycDto,
  ) {
    const adminId = req.user.id;
    return this.kycService.approveKYC(id, adminId, reviewKycDto.comment);
  }

  /**
   * Reject KYC - Admin only
   */
  @Post(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async rejectKYC(
    @Param('id') id: string,
    @Req() req: any,
    @Body() reviewKycDto: ReviewKycDto,
  ) {
    const adminId = req.user.id;
    if (!reviewKycDto.reason) {
      throw new BadRequestException('Reason is required for rejection');
    }
    return this.kycService.rejectKYC(id, adminId, reviewKycDto.reason);
  }

  /**
   * Get all pending KYC - Admin only
   */
  @Get('admin/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getPendingKYC() {
    return this.kycService.getPendingKYC();
  }

  /**
   * Get all KYC with filters - Admin only
   */
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getAllKYC(
    @Query('status') status?: string,
    @Query('from') fromDate?: string,
    @Query('to') toDate?: string,
  ) {
    return this.kycService.getAllKYC({
      status: status as any,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    });
  }

  /**
   * Get KYC statistics - Admin only
   */
  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getKYCStats() {
    return this.kycService.getKYCStats();
  }

  /**
   * Delete KYC - Admin only
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async deleteKYC(@Param('id') id: string) {
    return this.kycService.deleteKYC(id);
  }
}