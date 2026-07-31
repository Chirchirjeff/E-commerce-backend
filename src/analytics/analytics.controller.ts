import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('analytics')
@UseGuards(PermissionsGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @RequirePermissions('can_view_dashboard')
  async getDashboardStats() {
    return this.analyticsService.getDashboardStats();
  }

  @Get('revenue')
  @RequirePermissions('can_view_reports')
  async getRevenue(@Query('range') range?: string) {
    return this.analyticsService.getRevenue(range || '7d');
  }

  @Get('vendors')
  @RequirePermissions('can_view_reports')
  async getTopVendors(@Query('limit') limit?: string) {
    return this.analyticsService.getTopVendors(limit ? parseInt(limit) : 10);
  }

  @Get('order-status')
  @RequirePermissions('can_view_dashboard')
  async getOrderStatusDistribution() {
    return this.analyticsService.getOrderStatus();
  }
}