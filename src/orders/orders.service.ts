import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';
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
      // Platform-wide, atomic number — not scoped to a shop or a date.
      const sequence = await prisma.$queryRaw<{ value: bigint }[]>`SELECT nextval('order_number_seq') AS value`;
      const orderNumber = `QZ${sequence[0].value.toString().padStart(10, '0')}`;

      const order = await prisma.order.create({
        data: {
          orderNumber,
          trackingToken: crypto.randomBytes(24).toString('hex'),
          shopId,
          buyerId: userId,
          total,
          paymentStatus: 'PENDING',
          fulfillmentStatus: 'NEW',
          deliveryStatus: 'NOT_DISPATCHED',
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

  /**
   * Public order lookup for the storefront confirmation page.
   * No auth required. Flattens buyer + M-Pesa fields onto the response
   * so the page can render customer name, email, phone, receipt number,
   * and the human-readable order number.
   */
  async findOnePublic(id: string, buyerId: string) {
    const order = await this.client.order.findUnique({
      where: { id, buyerId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, thumbnailUrl: true },
            },
          },
        },
        shop: {
          select: { id: true, name: true },
        },
        buyer: {
          select: { id: true, name: true, email: true, phone: true },
        },
        mpesaTransaction: {
          select: {
            mpesaReceiptNumber: true,
            phoneNumber: true,
            status: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${id} was not found in your account`);
    }

    // Prefer delivery fields stored on the order at checkout time.
    // Fall back to buyer relation fields for legacy orders that predate the columns.
    return {
      ...order,
      customerName:    order.deliveryName    ?? order.buyer?.name    ?? '',
      customerEmail:   order.deliveryEmail   ?? order.buyer?.email   ?? '',
      customerPhone:   order.deliveryPhone   ?? order.buyer?.phone
                         ?? order.mpesaTransaction?.phoneNumber      ?? '',
      deliveryAddress: order.deliveryAddress ?? '',
      deliveryCity:    order.deliveryCity    ?? '',
      deliveryState:   order.deliveryState   ?? '',
      deliveryZip:     order.deliveryZip     ?? '',
      // Payment
      mpesaReceiptNumber: order.mpesaTransaction?.mpesaReceiptNumber ?? null,
      // Tracking — returned as-is (null until seller fills them in)
      trackingNumber:    order.trackingNumber    ?? null,
      shippingCarrier:   order.shippingCarrier   ?? null,
      estimatedDelivery: order.estimatedDelivery ?? null,
      dispatchedAt:      order.dispatchedAt      ?? null,
      trackingToken:     order.trackingToken,
    };
  }

  async findByTrackingToken(trackingToken: string, buyerId: string) {
    const buyer = await this.client.user.findUnique({
      where: { id: buyerId },
      select: { emailVerifiedAt: true },
    });
    if (!buyer?.emailVerifiedAt) {
      throw new ForbiddenException('Verify your email address before tracking orders.');
    }

    const order = await this.client.order.findUnique({
      where: { trackingToken, buyerId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, thumbnailUrl: true } },
          },
        },
        shop: { select: { id: true, name: true } },
        buyer: { select: { id: true, name: true, email: true, phone: true } },
        mpesaTransaction: {
          select: { mpesaReceiptNumber: true, phoneNumber: true, status: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('This tracking link does not belong to your account.');
    }

    return {
      ...order,
      customerName:    order.deliveryName    ?? order.buyer?.name    ?? '',
      customerEmail:   order.deliveryEmail   ?? order.buyer?.email   ?? '',
      customerPhone:   order.deliveryPhone   ?? order.buyer?.phone
                         ?? order.mpesaTransaction?.phoneNumber      ?? '',
      deliveryAddress: order.deliveryAddress ?? '',
      deliveryCity:    order.deliveryCity    ?? '',
      deliveryState:   order.deliveryState   ?? '',
      deliveryZip:     order.deliveryZip     ?? '',
      mpesaReceiptNumber: order.mpesaTransaction?.mpesaReceiptNumber ?? null,
      trackingNumber:    order.trackingNumber    ?? null,
      shippingCarrier:   order.shippingCarrier   ?? null,
      estimatedDelivery: order.estimatedDelivery ?? null,
      dispatchedAt:      order.dispatchedAt      ?? null,
    };
  }

  /** Returns an order only to the verified buyer who placed it. */
  async findForBuyerByOrderNumber(orderNumber: string, buyerId: string) {
    const buyer = await this.client.user.findUnique({
      where: { id: buyerId },
      select: { emailVerifiedAt: true },
    });
    if (!buyer?.emailVerifiedAt) {
      throw new ForbiddenException('Verify your email address before tracking orders.');
    }

    const order = await this.client.order.findFirst({
      where: { orderNumber: orderNumber.trim().toUpperCase(), buyerId },
      include: {
        items: { include: { product: { select: { id: true, name: true, thumbnailUrl: true } } } },
        shop: { select: { id: true, name: true } },
        mpesaTransaction: { select: { mpesaReceiptNumber: true, phoneNumber: true, status: true } },
      },
    });
    if (!order) {
      throw new NotFoundException('No order with that number belongs to your account.');
    }

    return {
      ...order,
      customerName: order.deliveryName ?? '',
      customerEmail: order.deliveryEmail ?? '',
      customerPhone: order.deliveryPhone ?? order.mpesaTransaction?.phoneNumber ?? '',
      deliveryAddress: order.deliveryAddress ?? '',
      deliveryCity: order.deliveryCity ?? '',
      deliveryState: order.deliveryState ?? '',
      deliveryZip: order.deliveryZip ?? '',
      mpesaReceiptNumber: order.mpesaTransaction?.mpesaReceiptNumber ?? null,
      trackingNumber: order.trackingNumber ?? null,
      shippingCarrier: order.shippingCarrier ?? null,
      estimatedDelivery: order.estimatedDelivery ?? null,
      dispatchedAt: order.dispatchedAt ?? null,
    };
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

  // ========================================
  // VENDOR-SPECIFIC METHODS
  // ========================================

  /**
   * Get recent orders for a vendor's shop
   */
  async findVendorRecent(shopId: string, limit: number) {
    return this.client.order.findMany({
      where: { shopId },
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

  /**
   * Get all orders for a vendor's shop
   */
  async findVendorOrders(shopId: string) {
    return this.client.order.findMany({
      where: { shopId },
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

  /**
   * Get a single order for a vendor (with ownership verification)
   */
  async findVendorOrder(orderId: string, vendorUserId: string) {
    const order = await this.client.order.findUnique({
      where: { id: orderId },
      include: this.sellerInclude(),
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    // Verify vendor owns this shop
    if (order.shop.ownerId !== vendorUserId) {
      throw new ForbiddenException('You do not own this order');
    }

    return order;
  }

  private async sellerShopIds(userId: string): Promise<string[]> {
    const shops = await this.client.shop.findMany({ where: { ownerId: userId }, select: { id: true } });
    return shops.map((shop) => shop.id);
  }

  private sellerInclude() {
    return {
      items: { include: { product: { select: { id: true, name: true, thumbnailUrl: true } } } },
      shop: { select: { id: true, name: true, ownerId: true } },
      buyer: { select: { id: true, name: true, email: true, phone: true } },
      mpesaTransaction: { select: { status: true, mpesaReceiptNumber: true, phoneNumber: true, createdAt: true } },
      events: { orderBy: { createdAt: 'asc' as const } },
      returnRequests: { orderBy: { requestedAt: 'desc' as const } },
      disputes: { orderBy: { openedAt: 'desc' as const } },
    };
  }

  private buildSellerWhere(shopIds: string[], query: Record<string, string>): any {
    const where: any = { shopId: { in: shopIds } };
    const value = (key: string) => query[key]?.trim();
    if (value('paymentStatus')) where.paymentStatus = value('paymentStatus');
    if (value('fulfillmentStatus')) where.fulfillmentStatus = value('fulfillmentStatus');
    if (value('deliveryStatus')) where.deliveryStatus = value('deliveryStatus');
    if (value('escrowStatus')) where.escrowStatus = value('escrowStatus');
    if (value('deliveryMethod')) where.deliveryMethod = value('deliveryMethod');
    if (value('tab') === 'returns') where.returnRequests = { some: {} };
    if (value('tab') === 'disputes') where.disputes = { some: { status: 'OPEN' } };
    const tab = value('tab');
    const tabStatuses: Record<string, string> = { new: 'NEW', processing: 'PROCESSING', ready: 'READY_FOR_DISPATCH', dispatched: 'DISPATCHED', delivered: 'COMPLETED', cancelled: 'CANCELLED' };
    if (tab && tabStatuses[tab]) where.fulfillmentStatus = tabStatuses[tab];
    if (value('from') || value('to')) {
      where.createdAt = {};
      if (value('from')) where.createdAt.gte = new Date(value('from')!);
      if (value('to')) { const end = new Date(value('to')!); end.setHours(23, 59, 59, 999); where.createdAt.lte = end; }
    }
    const search = value('search');
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { trackingNumber: { contains: search, mode: 'insensitive' } },
        { buyer: { is: { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }, { phone: { contains: search, mode: 'insensitive' } }] } } },
        { items: { some: { product: { is: { name: { contains: search, mode: 'insensitive' } } } } } },
      ];
    }
    return where;
  }

  async listForSeller(userId: string, query: Record<string, string>) {
    const shopIds = await this.sellerShopIds(userId);
    if (!shopIds.length) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where = this.buildSellerWhere(shopIds, query);
    const [data, total] = await this.client.$transaction([
      this.client.order.findMany({ where, include: this.sellerInclude(), orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.client.order.count({ where }),
    ]);
    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async summaryForSeller(userId: string, query: Record<string, string>) {
    const shopIds = await this.sellerShopIds(userId);
    if (!shopIds.length) return { new: 0, processing: 0, ready: 0, dispatched: 0, delivered: 0, cancelled: 0, returns: 0, disputes: 0, total: 0 };
    const where = this.buildSellerWhere(shopIds, { ...query, tab: '' });
    const orders = await this.client.order.findMany({ where, select: { fulfillmentStatus: true, returnRequests: { select: { id: true } }, disputes: { where: { status: 'OPEN' }, select: { id: true } } } });
    const count = (status: string) => orders.filter((order) => order.fulfillmentStatus === status).length;
    return { new: count('NEW'), processing: count('PROCESSING'), ready: count('READY_FOR_DISPATCH'), dispatched: count('DISPATCHED'), delivered: count('COMPLETED'), cancelled: count('CANCELLED'), returns: orders.filter((order) => order.returnRequests.length).length, disputes: orders.filter((order) => order.disputes.length).length, total: orders.length };
  }

  async exportForSeller(userId: string, query: Record<string, string>) {
    const shopIds = await this.sellerShopIds(userId);
    const where = this.buildSellerWhere(shopIds, query);
    const orders = await this.client.order.findMany({ where, include: this.sellerInclude(), orderBy: { createdAt: 'desc' } });
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = orders.map((order) => [order.orderNumber, order.buyer.name, order.buyer.email, order.items.map((item) => item.product.name).join(' | '), order.total, order.paymentStatus, order.fulfillmentStatus, order.deliveryStatus, order.trackingNumber, order.createdAt.toISOString()].map(escape).join(','));
    return ['Order number,Buyer,Email,Items,Total,Payment,Fulfillment,Delivery,Tracking number,Order date', ...rows].join('\n');
  }

  async updateSellerFulfillment(id: string, fulfillmentStatus: string, userId: string) {
    const allowed: Record<string, string[]> = { NEW: ['ACCEPTED', 'CANCELLED'], ACCEPTED: ['PROCESSING', 'CANCELLED'], PROCESSING: ['READY_FOR_DISPATCH'], READY_FOR_DISPATCH: ['DISPATCHED'], DISPATCHED: ['COMPLETED'] };
    const order = await this.findVendorOrder(id, userId);
    if (!allowed[order.fulfillmentStatus]?.includes(fulfillmentStatus)) throw new ForbiddenException('This order cannot move to that fulfillment state.');
    const deliveryStatus = fulfillmentStatus === 'DISPATCHED' ? 'IN_TRANSIT' : fulfillmentStatus === 'COMPLETED' ? 'DELIVERED' : order.deliveryStatus;
    return this.client.order.update({ where: { id }, data: { fulfillmentStatus, deliveryStatus, status: fulfillmentStatus.toLowerCase(), events: { create: { type: `FULFILLMENT_${fulfillmentStatus}`, message: `Seller marked order as ${fulfillmentStatus.replaceAll('_', ' ').toLowerCase()}`, actorId: userId } } }, include: this.sellerInclude() });
  }

  async dispatchForSeller(id: string, body: { trackingNumber?: string; shippingCarrier?: string; trackingUrl?: string; deliveryMethod?: string }, userId: string) {
    const order = await this.findVendorOrder(id, userId);
    if (order.fulfillmentStatus !== 'READY_FOR_DISPATCH') throw new ForbiddenException('Only orders ready for dispatch can be dispatched.');
    if (!body.trackingNumber?.trim()) throw new ForbiddenException('A tracking number is required to dispatch this order.');
    return this.client.order.update({ where: { id }, data: { ...body, fulfillmentStatus: 'DISPATCHED', deliveryStatus: 'IN_TRANSIT', dispatchedAt: new Date(), status: 'dispatched', events: { create: { type: 'ORDER_DISPATCHED', message: 'Seller dispatched order', actorId: userId } } }, include: this.sellerInclude() });
  }
}
