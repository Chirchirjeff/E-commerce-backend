// src/kyc/kyc.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { KYCStatus } from '@prisma/client';
import { CreateKycDto } from './dto/create-kyc.dto';
import { UpdateKycDto } from './dto/update-kyc.dto';
import { ReviewKycDto } from './dto/review-kyc.dto';

@Injectable()
export class KycService {
  constructor(private prisma: PrismaService) {}

  /**
   * Submit KYC for a user
   */
  async submitKYC(
    userId: string,
    createKycDto: CreateKycDto,
    idFileUrl: string,
    businessLicenseUrl: string,
  ) {
    // Check if KYC already exists
    const existingKYC = await this.prisma.client.kYC.findUnique({
      where: { userId },
    });

    if (existingKYC) {
      if (existingKYC.status === 'PENDING') {
        throw new ConflictException('KYC is already pending review');
      }
      if (existingKYC.status === 'VERIFIED') {
        throw new ConflictException('KYC is already verified');
      }
      // If REJECTED, allow resubmission - update existing
      return this.updateKYC(existingKYC.id, {
        ...createKycDto,
        idFile: idFileUrl,
        businessLicense: businessLicenseUrl,
        status: KYCStatus.PENDING,
      });
    }

    // Create new KYC
    return this.prisma.client.kYC.create({
      data: {
        userId,
        businessName: createKycDto.businessName,
        businessAddress: createKycDto.businessAddress,
        taxId: createKycDto.taxId,
        phone: createKycDto.phone,
        description: createKycDto.description,
        idFile: idFileUrl,
        businessLicense: businessLicenseUrl,
        status: KYCStatus.PENDING,
        submittedAt: new Date(),
      },
    });
  }

  /**
   * Get KYC status for a user
   */
  async getKYCStatus(userId: string) {
    const kyc = await this.prisma.client.kYC.findUnique({
      where: { userId },
      select: {
        id: true,
        status: true,
        businessName: true,
        submittedAt: true,
        reviewedAt: true,
        message: true,
        idFile: true,
        businessLicense: true,
      },
    });

    if (!kyc) {
      return {
        status: KYCStatus.NOT_SUBMITTED,
        message: 'KYC not submitted yet',
      };
    }

    return kyc;
  }

  /**
   * Get KYC by ID
   */
  async getKYCById(id: string) {
    const kyc = await this.prisma.client.kYC.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
          },
        },
        reviews: {
          include: {
            admin: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!kyc) {
      throw new NotFoundException(`KYC with ID ${id} not found`);
    }

    return kyc;
  }

  /**
   * Get KYC by user ID
   */
  async getKYCByUserId(userId: string) {
    const kyc = await this.prisma.client.kYC.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
          },
        },
        reviews: {
          include: {
            admin: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!kyc) {
      throw new NotFoundException(`KYC for user ${userId} not found`);
    }

    return kyc;
  }

  /**
   * Update KYC
   */
  async updateKYC(id: string, updateKycDto: UpdateKycDto) {
    const existingKYC = await this.prisma.client.kYC.findUnique({
      where: { id },
    });

    if (!existingKYC) {
      throw new NotFoundException(`KYC with ID ${id} not found`);
    }

    return this.prisma.client.kYC.update({
      where: { id },
      data: {
        businessName: updateKycDto.businessName,
        businessAddress: updateKycDto.businessAddress,
        taxId: updateKycDto.taxId,
        phone: updateKycDto.phone,
        description: updateKycDto.description,
        idFile: updateKycDto.idFile,
        businessLicense: updateKycDto.businessLicense,
        status: updateKycDto.status,
        message: updateKycDto.message,
        reviewedAt: updateKycDto.status ? new Date() : undefined,
      },
    });
  }

  /**
   * Approve KYC - Admin only
   */
  async approveKYC(kycId: string, adminId: string, comment?: string) {
    const kyc = await this.prisma.client.kYC.findUnique({
      where: { id: kycId },
      include: { user: true },
    });

    if (!kyc) {
      throw new NotFoundException(`KYC with ID ${kycId} not found`);
    }

    if (kyc.status === KYCStatus.VERIFIED) {
      throw new ConflictException('KYC is already verified');
    }

    // Start a transaction
    return this.prisma.client.$transaction(async (tx) => {
      // 1. Update KYC status
      const updatedKYC = await tx.kYC.update({
        where: { id: kycId },
        data: {
          status: KYCStatus.VERIFIED,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          message: comment || 'KYC approved successfully',
        },
      });

      // 2. Create review record
      await tx.kYCReview.create({
        data: {
          kycId: kycId,
          adminId: adminId,
          status: KYCStatus.VERIFIED,
          comment: comment || 'KYC approved successfully',
        },
      });

      // 3. Auto-create shop if it doesn't exist
      const existingShop = await tx.shop.findFirst({
        where: { ownerId: kyc.userId },
      });

      if (!existingShop) {
        await tx.shop.create({
          data: {
            name: `${kyc.businessName}'s Shop`,
            businessDescription: kyc.description || `Welcome to ${kyc.businessName}'s shop`,
            contactEmail: kyc.user.email,
            contactPhone: kyc.phone,
            ownerId: kyc.userId,
            verificationStatus: 'ACTIVE',
            slug: kyc.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          },
        });
      }

      // 4. Update user with phone if not set
      if (kyc.user.phone !== kyc.phone) {
        await tx.user.update({
          where: { id: kyc.userId },
          data: { phone: kyc.phone },
        });
      }

      return updatedKYC;
    });
  }

  /**
   * Reject KYC - Admin only
   */
  async rejectKYC(kycId: string, adminId: string, reason: string) {
    const kyc = await this.prisma.client.kYC.findUnique({
      where: { id: kycId },
    });

    if (!kyc) {
      throw new NotFoundException(`KYC with ID ${kycId} not found`);
    }

    if (kyc.status === KYCStatus.VERIFIED) {
      throw new ConflictException('Cannot reject already verified KYC');
    }

    return this.prisma.client.$transaction(async (tx) => {
      // 1. Update KYC status
      const updatedKYC = await tx.kYC.update({
        where: { id: kycId },
        data: {
          status: KYCStatus.REJECTED,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          message: reason,
        },
      });

      // 2. Create review record
      await tx.kYCReview.create({
        data: {
          kycId: kycId,
          adminId: adminId,
          status: KYCStatus.REJECTED,
          comment: reason,
        },
      });

      return updatedKYC;
    });
  }

  /**
   * Get all pending KYC submissions - Admin only
   */
  async getPendingKYC() {
    return this.prisma.client.kYC.findMany({
      where: {
        status: KYCStatus.PENDING,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: {
        submittedAt: 'asc',
      },
    });
  }

  /**
   * Get all KYC submissions with filters - Admin only
   */
  async getAllKYC(filters?: {
    status?: KYCStatus;
    fromDate?: Date;
    toDate?: Date;
  }) {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.fromDate || filters?.toDate) {
      where.submittedAt = {};
      if (filters?.fromDate) {
        where.submittedAt.gte = filters.fromDate;
      }
      if (filters?.toDate) {
        where.submittedAt.lte = filters.toDate;
      }
    }

    return this.prisma.client.kYC.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
          },
        },
        reviews: {
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            admin: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        submittedAt: 'desc',
      },
    });
  }

  /**
   * Get KYC statistics - Admin only
   */
  async getKYCStats() {
    const stats = await this.prisma.client.$transaction([
      this.prisma.client.kYC.count({
        where: { status: KYCStatus.NOT_SUBMITTED },
      }),
      this.prisma.client.kYC.count({
        where: { status: KYCStatus.PENDING },
      }),
      this.prisma.client.kYC.count({
        where: { status: KYCStatus.VERIFIED },
      }),
      this.prisma.client.kYC.count({
        where: { status: KYCStatus.REJECTED },
      }),
      this.prisma.client.kYC.count(), // Total
    ]);

    return {
      notSubmitted: stats[0],
      pending: stats[1],
      verified: stats[2],
      rejected: stats[3],
      total: stats[4],
    };
  }

  /**
   * Delete KYC - Admin only
   */
  async deleteKYC(id: string) {
    const kyc = await this.prisma.client.kYC.findUnique({
      where: { id },
    });

    if (!kyc) {
      throw new NotFoundException(`KYC with ID ${id} not found`);
    }

    return this.prisma.client.kYC.delete({
      where: { id },
    });
  }
}