import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';

@Injectable()
export class ShopsService {
  constructor(private prisma: PrismaService) {}

  // Get the Prisma client instance
  private get client() {
    return this.prisma.client;
  }

  async create(createShopDto: CreateShopDto, userId: string) {
    // Generate slug from name
    const slug = createShopDto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return this.client.shop.create({
      data: {
        ...createShopDto,
        slug,
        ownerId: userId,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async findAll(limit: number = 10, page: number = 1) {
    const skip = (page - 1) * limit;

    const [shops, total] = await Promise.all([
      this.client.shop.findMany({
        take: limit,
        skip,
        include: {
          _count: {
            select: { orders: true, products: true, reviews: true },
          },
          owner: {
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
      }),
      this.client.shop.count(),
    ]);

    return {
      data: shops,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTopVendors(limit: number = 8) {
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

    // Get revenue per vendor
    const vendorRevenue = await Promise.all(
      vendors.map(async (vendor) => {
        const revenue = await this.client.order.aggregate({
          where: { shopId: vendor.id, status: { not: 'cancelled' } },
          _sum: { total: true },
        });

        // Get average rating
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

  async getShopStats(shopId: string) {
    const [orders, revenue, products, rating, customers, orderStatusStats] = await Promise.all([
      this.client.order.count({ where: { shopId } }),
      this.client.order.aggregate({
        where: { shopId, status: { not: 'cancelled' } },
        _sum: { total: true },
      }),
      this.client.product.count({ where: { shopId } }),
      this.client.review.aggregate({
        where: { shopId, status: 'approved' },
        _avg: { rating: true },
      }),
      // Count unique customers (buyers) who ordered from this shop
      this.client.order.findMany({
        where: { shopId },
        distinct: ['buyerId'],
        select: { buyerId: true },
      }),
      // Order status distribution
      this.client.order.groupBy({
        by: ['status'],
        where: { shopId },
        _count: true,
      }),
    ]);

    return {
      totalOrders: orders,
      totalRevenue: revenue._sum.total || 0,
      totalProducts: products,
      averageRating: Number(rating._avg.rating?.toFixed(1)) || 0,
      totalCustomers: customers.length,
      orderStatusDistribution: orderStatusStats.map((stat) => ({
        name: stat.status,
        value: stat._count,
      })),
    };
  }

  async findMine(userId: string) {
    return this.client.shop.findMany({
      where: { ownerId: userId },
      include: {
        _count: {
          select: { orders: true, products: true },
        },
      },
    });
  }

  async findBySlug(slug: string) {
    const shop = await this.client.shop.findUnique({
      where: { slug },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: { orders: true, products: true, reviews: true },
        },
      },
    });

    if (!shop) {
      throw new NotFoundException(`Shop with slug ${slug} not found`);
    }

    return shop;
  }

  async findOne(id: string) {
    const shop = await this.client.shop.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: { orders: true, products: true, reviews: true },
        },
      },
    });

    if (!shop) {
      throw new NotFoundException(`Shop with ID ${id} not found`);
    }

    return shop;
  }

  async update(id: string, updateShopDto: UpdateShopDto) {
    // If name is being updated, regenerate slug
    let slug: string | undefined;
    if (updateShopDto.name) {
      slug = updateShopDto.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    return this.client.shop.update({
      where: { id },
      data: {
        ...updateShopDto,
        ...(slug && { slug }),
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }
}