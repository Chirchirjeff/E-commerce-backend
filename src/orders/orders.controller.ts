import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('orders')
@UseGuards(PermissionsGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequirePermissions('can_view_orders')
  async findAll(@Query() query: any) {
    return this.ordersService.findAll(query);
  }

  @Get('recent')
  @RequirePermissions('can_view_orders')
  async findRecent(@Query('limit') limit?: string) {
    return this.ordersService.findRecent(limit ? parseInt(limit) : 5);
  }

  @Get(':id')
  @RequirePermissions('can_view_orders')
  async findOne(@Param('id') id: string) {
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