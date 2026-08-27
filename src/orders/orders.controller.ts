import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query, BadRequestException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OrdersService } from './orders.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipGuard } from '../auth/decorators/skip-guard.decorator';
import { PrismaService } from '../prisma.service';

@Controller('orders')
@UseGuards(PermissionsGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @RequirePermissions('can_view_orders')
  async findAll(@CurrentUser() user: any) {
    const isVendor = !user.isAdmin;

    if (isVendor) {
      // Get vendor's shop
      const shop = await this.prisma.client.shop.findFirst({
        where: { ownerId: user.id },
      });

      if (!shop) {
        return [];
      }

      return this.ordersService.findVendorOrders(shop.id);
    }

    // Admin gets all orders
    return this.ordersService.findAll(user.id);
  }

  /**
   * Get recent orders
   * - For admins: returns platform-wide recent orders
   * - For vendors: returns only their shop's recent orders
   */
  @Get('recent')
  @RequirePermissions('can_view_orders')
  async findRecent(@CurrentUser() user: any, @Query('limit') limit?: string) {
    const isVendor = !user.isAdmin;
    const limitValue = limit ? parseInt(limit) : 5;

    if (isVendor) {
      // Get vendor's shop
      const shop = await this.prisma.client.shop.findFirst({
        where: { ownerId: user.id },
      });

      if (!shop) {
        return [];
      }

      return this.ordersService.findVendorRecent(shop.id, limitValue);
    }

    // Admin gets platform-wide recent orders
    return this.ordersService.findRecent(limitValue);
  }

  /** Seller-scoped, paginated order management endpoint. Shop identity is taken
   * from the authenticated user — never from a client-provided shop id. */
  @Get('seller/list')
  @RequirePermissions('can_view_orders')
  async sellerList(@CurrentUser() user: any, @Query() query: Record<string, string>) {
    return this.ordersService.listForSeller(user.id, query);
  }

  @Get('seller/summary')
  @RequirePermissions('can_view_orders')
  async sellerSummary(@CurrentUser() user: any, @Query() query: Record<string, string>) {
    return this.ordersService.summaryForSeller(user.id, query);
  }

  @Get('seller/export')
  @RequirePermissions('can_view_orders')
  async sellerExport(@CurrentUser() user: any, @Query() query: Record<string, string>, @Res() response: Response) {
    const csv = await this.ordersService.exportForSeller(user.id, query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    return response.send(csv);
  }

  @Get('seller/:id')
  @RequirePermissions('can_view_orders')
  async sellerOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ordersService.findVendorOrder(id, user.id);
  }

  @Put('seller/:id/fulfillment')
  @RequirePermissions('can_manage_orders')
  async sellerFulfillment(@Param('id') id: string, @Body() body: { fulfillmentStatus: string }, @CurrentUser() user: any) {
    return this.ordersService.updateSellerFulfillment(id, body.fulfillmentStatus, user.id);
  }

  @Put('seller/:id/dispatch')
  @RequirePermissions('can_manage_orders')
  async sellerDispatch(@Param('id') id: string, @Body() body: { trackingNumber?: string; shippingCarrier?: string; trackingUrl?: string; deliveryMethod?: string }, @CurrentUser() user: any) {
    return this.ordersService.dispatchForSeller(id, body, user.id);
  }

  @Get('track/:token')
  async track(@Param('token') token: string, @CurrentUser() user: any) {
    return this.ordersService.findByTrackingToken(token, user.id);
  }

  @Get('mine/number/:orderNumber')
  async trackByOrderNumber(@Param('orderNumber') orderNumber: string, @CurrentUser() user: any) {
    return this.ordersService.findForBuyerByOrderNumber(orderNumber, user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    // A buyer may view only their own order, including immediately after payment.
    return this.ordersService.findOnePublic(id, user.id);
  }

  @Post()
  async create(@Body() createOrderDto: any, @CurrentUser() user: any) {
    return this.ordersService.create(createOrderDto, user.id);
  }

  @Put(':id/status')
  @RequirePermissions('can_manage_orders')
  async updateStatus(@Param('id') id: string, @Body() body: { status: string }, @CurrentUser() user: any) {
    return this.ordersService.updateStatus(id, body.status, user.id);
  }

  @Delete(':id')
  @RequirePermissions('can_manage_orders')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ordersService.remove(id, user.id);
  }
}
