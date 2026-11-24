import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';

export type NotificationType =
  | 'kyc_pending'
  | 'profile_change_pending'
  | 'new_vendor'
  | 'email_failed';

/**
 * How many items are waiting for an admin in each dashboard section, keyed by
 * the sidebar route. Drives the count badges in the admin left panel.
 */
export type SectionCounts = Record<string, number>;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async getAdminNotifications(): Promise<{
    notifications: AdminNotification[];
    unreadCount: number;
    counts: SectionCounts;
  }> {
    const [
      pendingKyc,
      pendingProfileChanges,
      newVendors,
      emailFailures,
      counts,
    ] = await Promise.all([
      this.listPendingKyc(),
      this.listPendingProfileChanges(),
      this.listNewVendors(),
      // Seller emails that failed to send and have not been retried/dismissed
      this.db.emailFailure.findMany({
        where: { resolvedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.getSectionCounts(),
    ]);

    const notifications: AdminNotification[] = [];

    for (const failure of emailFailures) {
      const what =
        failure.outcome === 'approved'
          ? 'approval'
          : failure.outcome === 'rejected'
            ? 'rejection'
            : 'notification';
      notifications.push({
        id: `email-${failure.id}`,
        type: 'email_failed',
        title: 'Seller email not delivered',
        message: `The ${what} email to ${failure.recipientName ?? failure.recipientEmail} (${failure.recipientEmail}) failed to send`,
        resourceId: failure.id,
        href: '/kyc/vendors',
        createdAt: failure.createdAt.toISOString(),
      });
    }


    for (const kyc of pendingKyc) {
      notifications.push({
        id: `kyc-${kyc.id}`,
        type: 'kyc_pending',
        title: 'KYC Review Required',
        message: `${kyc.user.name} (${kyc.businessName}) submitted KYC documents`,
        resourceId: kyc.id,
        href: '/kyc/vendors',
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
        href: '/kyc/detail-changes',
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
      counts,
    };
  }

  /** Pending-work totals per sidebar section (exact counts, not capped). */
  async getSectionCounts(): Promise<SectionCounts> {
    const [
      pendingKyc,
      pendingProfileChanges,
      pendingShops,
      pendingReviews,
      pendingPayouts,
      openDisputes,
      emailFailures,
    ] = await Promise.all([
      this.db.kYC.count({ where: { status: 'PENDING' } }),
      this.db.profileChangeRequest.count({ where: { status: 'PENDING_REVIEW' } }),
      this.db.shop.count({ where: { verificationStatus: 'PENDING' } }),
      this.db.review.count({ where: { status: 'pending' } }),
      this.db.payout.count({ where: { status: 'pending' } }),
      this.db.orderDispute.count({ where: { status: 'OPEN' } }),
      this.db.emailFailure.count({ where: { resolvedAt: null } }),
    ]);

    return {
      // Both KYC pages work the same review queue.
      '/kyc/vendors': pendingKyc + emailFailures,
      '/kyc/clients': pendingKyc,
      '/kyc/detail-changes': pendingProfileChanges,
      '/vendors': pendingShops,
      '/reviews': pendingReviews,
      '/payouts': pendingPayouts,
      '/orders': openDisputes,
    };
  }

  /** Re-send a failed seller email. Resolves the alert when it goes through. */
  async retryEmailFailure(id: string, adminId: string) {
    const failure = await this.db.emailFailure.findUnique({ where: { id } });
    if (!failure || failure.resolvedAt) {
      throw new NotFoundException('This email alert no longer exists.');
    }

    let error = 'This email can no longer be re-sent.';
    const kyc = failure.kycId
      ? await this.db.kYC.findUnique({
          where: { id: failure.kycId },
          include: { user: true },
        })
      : null;

    if (
      kyc &&
      (failure.outcome === 'approved' || failure.outcome === 'rejected')
    ) {
      const result = await this.emailService.sendKycStatusEmail({
        recipientEmail: kyc.user.email,
        recipientName: kyc.user.name,
        businessName: kyc.businessName,
        outcome: failure.outcome,
        ...(failure.outcome === 'rejected'
          ? { reason: kyc.message ?? undefined }
          : {}),
      });
      if (result.sent) {
        await this.db.emailFailure.update({
          where: { id },
          data: {
            resolvedAt: new Date(),
            resolvedBy: adminId,
            resolution: 'RESENT',
          },
        });
        return { sent: true };
      }
      error = result.error ?? 'Unknown email error';
    }

    await this.db.emailFailure.update({
      where: { id },
      data: { attempts: { increment: 1 }, error: error.slice(0, 500) },
    });
    return { sent: false, error };
  }

  /** Clear a failed-email alert without re-sending (e.g. seller was phoned). */
  async dismissEmailFailure(id: string, adminId: string) {
    const failure = await this.db.emailFailure.findUnique({ where: { id } });
    if (!failure || failure.resolvedAt) {
      throw new NotFoundException('This email alert no longer exists.');
    }
    await this.db.emailFailure.update({
      where: { id },
      data: {
        resolvedAt: new Date(),
        resolvedBy: adminId,
        resolution: 'DISMISSED',
      },
    });
    return { dismissed: true };
  }

  private listPendingKyc() {
    return this.db.kYC.findMany({
      where: { status: 'PENDING' },
      select: {
        id: true,
        businessName: true,
        submittedAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 50,
    });
  }

  private listPendingProfileChanges() {
    return this.db.profileChangeRequest.findMany({
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
    });
  }

  /** Shops registered in the last 7 days that are still pending. */
  private listNewVendors() {
    return this.db.shop.findMany({
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
    });
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
