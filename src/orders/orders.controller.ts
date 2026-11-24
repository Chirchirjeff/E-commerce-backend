import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, UseGuards, Query, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { OrdersService } from './orders.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipGuard, OptionalAuth } from '../auth/decorators/skip-guard.decorator';
import { PrismaService } from '../prisma.service';
import { UpdateDeliveryDto } from './dto/update-order.dto';

@Controller('orders')
@UseGuards(PermissionsGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Admin / seller list endpoints ───────────────────────────────────────────

  @Get()
  @RequirePermissions('can_view_orders')
  async findAll(@CurrentUser() user: any) {
    if (!user.isAdmin) {
      const shop = await this.prisma.client.shop.findFirst({ where: { ownerId: user.id } });
      if (!shop) return [];
      return this.ordersService.findVendorOrders(shop.id);
    }
    return this.ordersService.findAll(user.id);
  }

  @Get('recent')
  @RequirePermissions('can_view_orders')
  async findRecent(@CurrentUser() user: any, @Query('limit') limit?: string) {
    const limitValue = limit ? parseInt(limit) : 5;
    if (!user.isAdmin) {
      const shop = await this.prisma.client.shop.findFirst({ where: { ownerId: user.id } });
      if (!shop) return [];
      return this.ordersService.findVendorRecent(shop.id, limitValue);
    }
    return this.ordersService.findRecent(limitValue);
  }

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
  async sellerExport(
    @CurrentUser() user: any,
    @Query() query: Record<string, string>,
    @Res() response: Response,
  ) {
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
  async sellerFulfillment(
    @Param('id') id: string,
    @Body() body: { fulfillmentStatus: string },
    @CurrentUser() user: any,
  ) {
    return this.ordersService.updateSellerFulfillment(id, body.fulfillmentStatus, user.id);
  }

  @Put('seller/:id/dispatch')
  @RequirePermissions('can_manage_orders')
  async sellerDispatch(
    @Param('id') id: string,
    @Body() body: { trackingNumber?: string; shippingCarrier?: string; trackingUrl?: string; deliveryMethod?: string },
    @CurrentUser() user: any,
  ) {
    return this.ordersService.dispatchForSeller(id, body, user.id);
  }

  // ── Buyer-authenticated endpoints ───────────────────────────────────────────

  /** Authenticated tracking by tracking token (used from /track/[token] page). */
  @Get('track/:token')
  async track(@Param('token') token: string, @CurrentUser() user: any) {
    return this.ordersService.findByTrackingToken(token, user.id);
  }

  /** The signed-in buyer's own orders, newest first. */
  @Get('mine')
  async findMine(@CurrentUser() user: any) {
    return this.ordersService.findMineForBuyer(user.id);
  }

  @Get('mine/number/:orderNumber')
  async trackByOrderNumber(
    @Param('orderNumber') orderNumber: string,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.findForBuyerByOrderNumber(orderNumber, user.id);
  }

  // ── Public / guest endpoints ────────────────────────────────────────────────

  /**
   * GET /orders/public/token/:trackingToken
   *
   * No auth required. Guest buyers use this immediately after payment.
   * The 48-hex trackingToken is their proof of purchase.
   */
  @Get('public/token/:trackingToken')
  @SkipGuard()
  async findByTokenPublic(@Param('trackingToken') trackingToken: string) {
    return this.ordersService.findByTrackingTokenPublic(trackingToken);
  }

  /**
   * POST /orders/public/lookup { orderNumber, phone }
   * Track an order with the order number and the phone used at checkout.
   * Returns { orderId, trackingToken }.
   */
  @Post('public/lookup')
  @SkipGuard()
  @HttpCode(HttpStatus.OK)
  async lookup(@Body() body: { orderNumber: string; phone: string }) {
    return this.ordersService.lookupForGuest(body?.orderNumber, body?.phone);
  }

  /** POST /orders/:id/received { trackingToken? } — buyer confirms delivery. */
  @Post(':id/received')
  @OptionalAuth()
  @HttpCode(HttpStatus.OK)
  async confirmReceived(
    @Param('id') id: string,
    @Body() body: { trackingToken?: string },
    @CurrentUser() user: any,
  ) {
    return this.ordersService.confirmReceivedByBuyer(id, user?.id ?? null, body?.trackingToken);
  }

  /** POST /orders/:id/return { reason, trackingToken? } — buyer requests a return. */
  @Post(':id/return')
  @OptionalAuth()
  async requestReturn(
    @Param('id') id: string,
    @Body() body: { reason: string; trackingToken?: string },
    @CurrentUser() user: any,
  ) {
    return this.ordersService.requestReturnByBuyer(id, body?.reason, user?.id ?? null, body?.trackingToken);
  }

  /**
   * GET /orders/:id?trackingToken=xxx
   *
   * Works for both authenticated buyers (by buyerId) and guest buyers (by
   * trackingToken query param). The OptionalAuth decorator lets unauthenticated
   * requests through while still populating request.user when a valid JWT exists.
   */
  @Get(':id')
  @OptionalAuth()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('trackingToken') trackingToken?: string,
  ) {
    return this.ordersService.findOnePublic(id, user?.id ?? null, trackingToken);
  }

  @Post()
  async create(@Body() createOrderDto: any, @CurrentUser() user: any) {
    return this.ordersService.create(createOrderDto, user.id);
  }

  @Put(':id/status')
  @RequirePermissions('can_manage_orders')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentUser() user: any,
  ) {
    return this.ordersService.updateStatus(id, body.status, user.id);
  }

  @Delete(':id')
  @RequirePermissions('can_manage_orders')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ordersService.remove(id, user.id);
  }

  /**
   * PATCH /orders/:id/delivery
   *
   * Skips JWT guard entirely so both authenticated and guest buyers can call it.
   * - Authenticated: service validates buyerId ownership.
   * - Guest: service validates trackingToken in body against the order record.
   */
  @Patch(':id/delivery')
  @SkipGuard()
  async updateDelivery(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryDto & { trackingToken?: string },
    @CurrentUser() user: any,
  ) {
    return this.ordersService.updateDeliveryForBuyer(
      id,
      dto,
      user?.id ?? null,
      dto.trackingToken,
    );
  }
}
