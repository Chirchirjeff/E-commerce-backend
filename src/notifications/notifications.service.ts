import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export type NotificationType =
  | 'kyc_pending'
  | 'profile_change_pending'
  | 'new_vendor';

export interface AdminNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  resourceId: string;
  href: string;
  createdAt: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async getAdminNotifications(): Promise<{
    notifications: AdminNotification[];
    unreadCount: number;
  }> {
    // Run all three queries in parallel
    const [pendingKyc, pendingProfileChanges, newVendors] = await Promise.all([
      // KYC submissions awaiting review
      this.db.kYC.findMany({
        where: { status: 'PENDING' },
        select: {
          id: true,
          businessName: true,
          submittedAt: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { submittedAt: 'desc' },
        take: 50,
      }),

      // Profile change requests awaiting admin review
      this.db.profileChangeRequest.findMany({
        where: { status: 'PENDING_REVIEW' },
        select: {
          id: true,
          reference: true,
          field: true,
          newValue: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),

      // New vendors registered in the last 7 days
      this.db.shop.findMany({
        where: {
          verificationStatus: 'PENDING',
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        select: {
          id: true,
          name: true,
          createdAt: true,
          owner: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const notifications: AdminNotification[] = [];

    for (const kyc of pendingKyc) {
      notifications.push({
        id: `kyc-${kyc.id}`,
        type: 'kyc_pending',
        title: 'KYC Review Required',
        message: `${kyc.user.name} (${kyc.businessName}) submitted KYC documents`,
        resourceId: kyc.id,
        href: '/kyc',
        createdAt: kyc.submittedAt.toISOString(),
      });
    }

    for (const pcr of pendingProfileChanges) {
      const fieldLabel = this.fieldLabel(pcr.field);
      notifications.push({
        id: `pcr-${pcr.id}`,
        type: 'profile_change_pending',
        title: 'Profile Change Request',
        message: `${pcr.user.name} requested a ${fieldLabel} change (${pcr.reference})`,
        resourceId: pcr.id,
        href: '/vendors',
        createdAt: pcr.createdAt.toISOString(),
      });
    }

    for (const shop of newVendors) {
      notifications.push({
        id: `vendor-${shop.id}`,
        type: 'new_vendor',
        title: 'New Vendor Registered',
        message: `${shop.owner.name} registered "${shop.name}"`,
        resourceId: shop.id,
        href: '/vendors',
        createdAt: shop.createdAt.toISOString(),
      });
    }

    // Sort all notifications newest-first
    notifications.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return {
      notifications,
      unreadCount: notifications.length,
    };
  }

  private fieldLabel(field: string): string {
    const labels: Record<string, string> = {
      EMAIL: 'email',
      PHONE: 'phone',
      FULL_NAME: 'full name',
      BUSINESS_NAME: 'business name',
      BUSINESS_ADDRESS: 'business address',
      TAX_ID: 'tax ID',
    };
    return labels[field] ?? field.toLowerCase().replace(/_/g, ' ');
  }
}
