import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma.service';

@Controller('analytics')
@UseGuards(PermissionsGuard)
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Seller analytics for the signed-in seller's own shop.
   * GET /analytics/seller?days=30  (7 | 30 | 90 | 365)
   * No admin permission needed — the shop is resolved from the seller's own
   * account, so a seller can only ever see their own numbers.
   */
  @Get('seller')
  async getSellerAnalytics(@CurrentUser() user: any, @Query('days') daysParam?: string) {
    if (user?.isAdmin) throw new BadRequestException('Use the platform analytics endpoints for admin accounts.');
    const allowed = [7, 30, 90, 365];
    const days = allowed.includes(Number(daysParam)) ? Number(daysParam) : 30;
    const shop = await this.prisma.client.shop.findFirst({
      where: { ownerId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
    if (!shop) return null;
    return { shop, ...(await this.analyticsService.getSellerAnalytics(shop.id, days)) };
  }

  /**
   * Get dashboard stats
   * - For admins: returns platform-wide stats
   * - For vendors: returns only their shop's stats
   */
  @Get('dashboard')
  @RequirePermissions('can_view_dashboard')
  async getDashboardStats(@CurrentUser() user: any) {
    // Check if user is vendor (not admin)
    const isVendor = !user.isAdmin;

    if (isVendor) {
      // Get vendor's shop
      const shop = await this.prisma.client.shop.findFirst({
        where: { ownerId: user.id },
      });

      if (!shop) {
        // Vendor has no shop yet
        return {
          totalRevenue: 0,
          totalOrders: 0,
          totalProducts: 0,
          pendingOrders: 0,
          averageRating: 0,
          revenueGrowth: 0,
          orderGrowth: 0,
          orderStatus: [],
          message: 'No shop found. Complete your KYC to create a shop.',
        };
      }

      return this.analyticsService.getVendorDashboardStats(shop.id);
    }

    // Admin gets platform-wide stats
    return this.analyticsService.getDashboardStats();
  }

  /**
   * Get revenue data
   * - For admins: returns platform-wide revenue
   * - For vendors: returns only their shop's revenue
   */
  @Get('revenue')
  @RequirePermissions('can_view_reports')
  async getRevenue(@CurrentUser() user: any, @Query('range') range?: string) {
    const isVendor = !user.isAdmin;

    if (isVendor) {
      const shop = await this.prisma.client.shop.findFirst({
        where: { ownerId: user.id },
      });

      if (!shop) {
        return [];
      }

      return this.analyticsService.getVendorRevenue(shop.id, range || '7d');
    }

    return this.analyticsService.getRevenue(range || '7d');
  }

  /**
   * Get top vendors (platform view only - admins)
   */
  @Get('vendors')
  @RequirePermissions('can_view_reports')
  async getTopVendors(@CurrentUser() user: any, @Query('limit') limit?: string) {
    const isVendor = !user.isAdmin;

    if (isVendor) {
      throw new BadRequestException('Vendors cannot view other vendors');
    }

    return this.analyticsService.getTopVendors(limit ? parseInt(limit) : 10);
  }

  /**
   * Get order status distribution
   * - For admins: returns platform-wide distribution
   * - For vendors: returns only their shop's distribution
   */
  @Get('order-status')
  @RequirePermissions('can_view_dashboard')
  async getOrderStatusDistribution(@CurrentUser() user: any) {
    const isVendor = !user.isAdmin;

    if (isVendor) {
      const shop = await this.prisma.client.shop.findFirst({
        where: { ownerId: user.id },
      });

      if (!shop) {
        return [];
      }

      return this.analyticsService.getVendorOrderStatus(shop.id);
    }

    return this.analyticsService.getOrderStatus();
  }
}