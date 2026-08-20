import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query, BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
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
        where: { ownerId: user.sub },
      });

      if (!shop) {
        return [];
      }

      return this.ordersService.findVendorOrders(shop.id);
    }

    // Admin gets all orders
    return this.ordersService.findAll(user.sub);
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
        where: { ownerId: user.sub },
      });

      if (!shop) {
        return [];
      }

      return this.ordersService.findVendorRecent(shop.id, limitValue);
    }

    // Admin gets platform-wide recent orders
    return this.ordersService.findRecent(limitValue);
  }

  @Get(':id')
  @RequirePermissions('can_view_orders')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const isVendor = !user.isAdmin;

    if (isVendor) {
      return this.ordersService.findVendorOrder(id, user.sub);
    }

    return this.ordersService.findOne(id);
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