import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  private get client() {
    return this.prisma.client;
  }

  async create(createOrderDto: CreateOrderDto, userId: string) {
    const { shopId, items, total } = createOrderDto;

    // Verify shop exists
    const shop = await this.client.shop.findUnique({
      where: { id: shopId },
    });
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    // Verify all products exist and have enough stock
    for (const item of items) {
      const product = await this.client.product.findUnique({
        where: { id: item.productId },
      });
      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }
      if (product.stockQuantity < item.quantity) {
        throw new ForbiddenException(`Insufficient stock for product ${product.name}`);
      }
    }

    // Create order and order items in a transaction
    return this.client.$transaction(async (prisma) => {
      const order = await prisma.order.create({
        data: {
          shopId,
          buyerId: userId,
          total,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
              subtotal: item.price * item.quantity,
            })),
          },
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          shop: {
            select: {
              id: true,
              name: true,
              ownerId: true, // <-- ADD THIS
            },
          },
          buyer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Update stock quantities
      for (const item of items) {
        await prisma.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: {
              decrement: item.quantity,
            },
          },
        });
      }

      return order;
    });
  }

  async findAll(userId: string) {
    return this.client.order.findMany({
      where: {
        OR: [
          { buyerId: userId },
          { shop: { ownerId: userId } },
        ],
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
            ownerId: true, // <-- ADD THIS
          },
        },
        buyer: {
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
    });
  }

  async findRecent(limit: number) {
    return this.client.order.findMany({
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
            ownerId: true, // <-- ADD THIS
          },
        },
        buyer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async getStatusStats() {
    const stats = await this.client.order.groupBy({
      by: ['status'],
      _count: true,
    });

    return stats.map((item) => ({
      name: item.status,
      value: item._count,
    }));
  }

  async findByShop(shopId: string, userId: string) {
    // Verify user owns the shop
    const shop = await this.client.shop.findUnique({
      where: { id: shopId },
    });
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }
    if (shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this shop');
    }

    return this.client.order.findMany({
      where: { shopId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        buyer: {
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
    });
  }

  async findOne(id: string) {
    const order = await this.client.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
            ownerId: true, // <-- ADD THIS
          },
        },
        buyer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    return order;
  }

  async update(id: string, updateOrderDto: UpdateOrderDto, userId: string) {
    const order = await this.findOne(id);

    // Check if user is authorized (buyer or shop owner)
    if (order.buyerId !== userId && order.shop.ownerId !== userId) {
      throw new ForbiddenException('You are not authorized to update this order');
    }

    return this.client.order.update({
      where: { id },
      data: updateOrderDto,
      include: {
        items: {
          include: {
            product: true,
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
            ownerId: true, // <-- ADD THIS
          },
        },
        buyer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async updateStatus(id: string, status: string, userId: string) {
    const order = await this.findOne(id);

    // Only shop owner can update status
    if (order.shop.ownerId !== userId) {
      throw new ForbiddenException('Only the shop owner can update order status');
    }

    return this.client.order.update({
      where: { id },
      data: { status },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
            ownerId: true, // <-- ADD THIS
          },
        },
        buyer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async remove(id: string, userId: string) {
    const order = await this.findOne(id);

    // Only shop owner can delete orders
    if (order.shop.ownerId !== userId) {
      throw new ForbiddenException('Only the shop owner can delete orders');
    }

    // Restore stock quantities
    for (const item of order.items) {
      await this.client.product.update({
        where: { id: item.productId },
        data: {
          stockQuantity: {
            increment: item.quantity,
          },
        },
      });
    }

    return this.client.order.delete({
      where: { id },
    });
  }
}