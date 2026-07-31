import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  private get client() {
    return this.prisma.client;
  }

  async getDashboardStats() {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Current month stats
    const [currentMonthOrders, currentMonthRevenue] = await Promise.all([
      this.client.order.count({
        where: { createdAt: { gte: firstDayOfMonth } },
      }),
      this.client.order.aggregate({
        where: { createdAt: { gte: firstDayOfMonth }, status: { not: 'cancelled' } },
        _sum: { total: true },
      }),
    ]);

    // Last month stats
    const [lastMonthOrders, lastMonthRevenue] = await Promise.all([
      this.client.order.count({
        where: {
          createdAt: { gte: firstDayOfLastMonth, lt: firstDayOfMonth },
        },
      }),
      this.client.order.aggregate({
        where: {
          createdAt: { gte: firstDayOfLastMonth, lt: firstDayOfMonth },
          status: { not: 'cancelled' },
        },
        _sum: { total: true },
      }),
    ]);

    // Total counts
    const [totalOrders, totalRevenue, totalVendors, totalCustomers, pendingOrders] = await Promise.all([
      this.client.order.count(),
      this.client.order.aggregate({ _sum: { total: true }, where: { status: { not: 'cancelled' } } }),
      this.client.shop.count(),
      this.client.user.count(),
      this.client.order.count({ where: { status: 'pending' } }),
    ]);

    // Average rating
    const avgRating = await this.client.review.aggregate({
      _avg: { rating: true },
      where: { status: 'approved' },
    });

    // Calculate growth
    const calculateGrowth = (current: number, previous: number) => {
      if (previous === 0) return 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const totalRevenueValue = totalRevenue._sum.total || 0;
    const currentRevenueValue = currentMonthRevenue._sum.total || 0;
    const lastRevenueValue = lastMonthRevenue._sum.total || 0;

    // Get order status distribution
    const orderStatus = await this.getOrderStatus();

    return {
      totalRevenue: totalRevenueValue,
      platformCommission: totalRevenueValue * 0.1,
      activeVendors: totalVendors,
      totalOrders,
      totalCustomers,
      pendingOrders,
      averageRating: Number(avgRating._avg.rating?.toFixed(1)) || 0,
      revenueGrowth: calculateGrowth(currentRevenueValue, lastRevenueValue),
      orderGrowth: calculateGrowth(currentMonthOrders, lastMonthOrders),
      vendorGrowth: 8.3,
      commissionGrowth: calculateGrowth(currentRevenueValue * 0.1, lastRevenueValue * 0.1),
      growthRate: 18.4,
      orderStatus,
    };
  }

  async getRevenue(range: string) {
    const days = parseInt(range) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const orders = await this.client.order.findMany({
      where: {
        createdAt: { gte: startDate },
        status: { not: 'cancelled' },
      },
      select: {
        total: true,
        createdAt: true,
      },
    });

    // Group by date
    const groupedData: Record<string, { date: string; revenue: number; orders: number }> = {};
    
    orders.forEach((order) => {
      const date = order.createdAt.toISOString().split('T')[0];
      if (!groupedData[date]) {
        groupedData[date] = { date, revenue: 0, orders: 0 };
      }
      groupedData[date].revenue += order.total;
      groupedData[date].orders += 1;
    });

    // Fill missing dates
    const result: Array<{ date: string; revenue: number; orders: number }> = [];
    const currentDate = new Date(startDate);
    const endDate = new Date();
    
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        revenue: groupedData[dateStr]?.revenue || 0,
        orders: groupedData[dateStr]?.orders || 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
  }

  async getTopVendors(limit: number) {
    const vendors = await this.client.shop.findMany({
      take: limit,
      orderBy: {
        orders: {
          _count: 'desc',
        },
      },
      include: {
        _count: {
          select: { orders: true, products: true },
        },
      },
    });

    const vendorRevenue = await Promise.all(
      vendors.map(async (vendor) => {
        const revenue = await this.client.order.aggregate({
          where: { shopId: vendor.id, status: { not: 'cancelled' } },
          _sum: { total: true },
        });

        const rating = await this.client.review.aggregate({
          where: { shopId: vendor.id, status: 'approved' },
          _avg: { rating: true },
        });

        return {
          name: vendor.name,
          revenue: revenue._sum.total || 0,
          orders: vendor._count.orders,
          rating: Number(rating._avg.rating?.toFixed(1)) || 0,
        };
      })
    );

    return vendorRevenue.sort((a, b) => b.revenue - a.revenue);
  }

  async getOrderStatus() {
    const stats = await this.client.order.groupBy({
      by: ['status'],
      _count: true,
    });

    return stats.map((item) => ({
      name: item.status,
      value: item._count,
    }));
  }

  async getVendorGrowth() {
    const total = await this.client.shop.count();
    const lastMonth = await this.client.shop.count({
      where: {
        createdAt: {
          gte: new Date(new Date().setMonth(new Date().getMonth() - 1)),
        },
      },
    });

    return {
      total,
      growth: lastMonth > 0 ? Math.round((total / lastMonth) * 100) : 100,
    };
  }
}