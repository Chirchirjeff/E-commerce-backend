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

  // ========================================
  // VENDOR-SPECIFIC ANALYTICS (filtered by shopId)
  // ========================================

  /**
   * Get vendor dashboard stats (for seller/vendor view)
   */
  async getVendorDashboardStats(shopId: string) {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const whereFilter = { shopId };
    const whereFilterMonth = { shopId, createdAt: { gte: firstDayOfMonth } };
    const whereFilterLastMonth = {
      shopId,
      createdAt: { gte: firstDayOfLastMonth, lt: firstDayOfMonth },
    };

    // Current month stats
    const [currentMonthOrders, currentMonthRevenue] = await Promise.all([
      this.client.order.count({ where: whereFilterMonth }),
      this.client.order.aggregate({
        where: { ...whereFilterMonth, status: { not: 'cancelled' } },
        _sum: { total: true },
      }),
    ]);

    // Last month stats
    const [lastMonthOrders, lastMonthRevenue] = await Promise.all([
      this.client.order.count({ where: whereFilterLastMonth }),
      this.client.order.aggregate({
        where: { ...whereFilterLastMonth, status: { not: 'cancelled' } },
        _sum: { total: true },
      }),
    ]);

    // Total counts for this shop
    const [totalOrders, totalRevenue, totalProducts, pendingOrders] = await Promise.all([
      this.client.order.count({ where: whereFilter }),
      this.client.order.aggregate({
        where: { ...whereFilter, status: { not: 'cancelled' } },
        _sum: { total: true },
      }),
      this.client.product.count({ where: { shopId } }),
      this.client.order.count({ where: { ...whereFilter, status: 'pending' } }),
    ]);

    // Average rating for this shop
    const avgRating = await this.client.review.aggregate({
      _avg: { rating: true },
      where: { shopId, status: 'approved' },
    });

    // Calculate growth
    const calculateGrowth = (current: number, previous: number) => {
      if (previous === 0) return 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const totalRevenueValue = totalRevenue._sum.total || 0;
    const currentRevenueValue = currentMonthRevenue._sum.total || 0;
    const lastRevenueValue = lastMonthRevenue._sum.total || 0;

    // Get order status distribution for this shop
    const orderStatus = await this.getVendorOrderStatus(shopId);

    return {
      totalRevenue: totalRevenueValue,
      totalOrders,
      totalProducts,
      pendingOrders,
      averageRating: Number(avgRating._avg.rating?.toFixed(1)) || 0,
      revenueGrowth: calculateGrowth(currentRevenueValue, lastRevenueValue),
      orderGrowth: calculateGrowth(currentMonthOrders, lastMonthOrders),
      orderStatus,
    };
  }

  /**
   * Get vendor revenue data (for seller/vendor view)
   */
  async getVendorRevenue(shopId: string, range: string) {
    const days = parseInt(range) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const orders = await this.client.order.findMany({
      where: {
        shopId,
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

  /**
   * Get order status distribution for a vendor
   */
  async getVendorOrderStatus(shopId: string) {
    const stats = await this.client.order.groupBy({
      by: ['status'],
      where: { shopId },
      _count: true,
    });

    return stats.map((item) => ({
      name: item.status,
      value: item._count,
    }));
  }

  /**
   * Everything the seller analytics page needs for one period, compared with
   * the period immediately before it. Days are bucketed in East Africa Time.
   */
  async getSellerAnalytics(shopId: string, days: number) {
    const DAY = 24 * 60 * 60 * 1000;
    const EAT_OFFSET = 3 * 60 * 60 * 1000;
    const dayKey = (d: Date) => new Date(d.getTime() + EAT_OFFSET).toISOString().slice(0, 10);

    const now = new Date();
    const todayStartEat = new Date(dayKey(now) + 'T00:00:00.000Z').getTime() - EAT_OFFSET;
    const start = new Date(todayStartEat - (days - 1) * DAY);
    const prevStart = new Date(start.getTime() - days * DAY);
    const active = { not: 'cancelled' };

    const [current, previous, statusRows, itemRows, totalProducts, ratingAgg] = await Promise.all([
      this.client.order.findMany({
        where: { shopId, createdAt: { gte: start } },
        select: { total: true, createdAt: true, status: true, buyerId: true },
      }),
      this.client.order.findMany({
        where: { shopId, createdAt: { gte: prevStart, lt: start }, status: active },
        select: { total: true, buyerId: true },
      }),
      this.client.order.groupBy({ by: ['status'], where: { shopId, createdAt: { gte: start } }, _count: true }),
      this.client.orderItem.groupBy({
        by: ['productId'],
        where: { order: { shopId, createdAt: { gte: start }, status: active } },
        _sum: { subtotal: true, quantity: true },
        orderBy: { _sum: { subtotal: 'desc' } },
        take: 5,
      }),
      this.client.product.count({ where: { shopId } }),
      this.client.review.aggregate({ where: { shopId, status: 'approved' }, _avg: { rating: true }, _count: true }),
    ]);

    const paid = current.filter((o) => o.status !== 'cancelled');
    const sum = (rows: { total: number }[]) => rows.reduce((t, o) => t + o.total, 0);
    const kpis = (rows: { total: number; buyerId: string | null }[]) => {
      const revenue = sum(rows);
      return {
        revenue,
        orders: rows.length,
        customers: new Set(rows.map((o) => o.buyerId).filter(Boolean)).size,
        averageOrderValue: rows.length ? revenue / rows.length : 0,
      };
    };

    const buckets = new Map<string, { date: string; revenue: number; orders: number }>();
    for (let t = start.getTime(); t <= todayStartEat; t += DAY) {
      const key = dayKey(new Date(t));
      buckets.set(key, { date: key, revenue: 0, orders: 0 });
    }
    for (const o of paid) {
      const b = buckets.get(dayKey(o.createdAt));
      if (b) { b.revenue += o.total; b.orders += 1; }
    }

    const products = itemRows.length
      ? await this.client.product.findMany({
          where: { id: { in: itemRows.map((r) => r.productId) } },
          select: { id: true, name: true, thumbnailUrl: true },
        })
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));

    return {
      range: { days, start: start.toISOString(), end: now.toISOString() },
      current: kpis(paid),
      previous: kpis(previous),
      series: Array.from(buckets.values()),
      statusDistribution: statusRows
        .map((r) => ({ name: r.status, value: r._count }))
        .sort((a, b) => b.value - a.value),
      topProducts: itemRows.map((r) => ({
        productId: r.productId,
        name: productById.get(r.productId)?.name ?? 'Deleted product',
        thumbnailUrl: productById.get(r.productId)?.thumbnailUrl ?? null,
        revenue: r._sum.subtotal ?? 0,
        quantity: r._sum.quantity ?? 0,
      })),
      totalProducts,
      averageRating: Number(ratingAgg._avg.rating?.toFixed(1)) || 0,
      reviewCount: ratingAgg._count,
    };
  }
}
