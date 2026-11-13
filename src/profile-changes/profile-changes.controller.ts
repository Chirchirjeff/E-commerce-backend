import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ProfileChangesService } from './profile-changes.service';
import type { CreateChangeRequestBody } from './profile-changes.service';

function requestMeta(req: any) {
  const forwarded = req.headers?.['x-forwarded-for'];
  return {
    ip: (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0])?.trim() || req.ip,
    userAgent: req.headers?.['user-agent'],
  };
}

/** Seller-facing: request and confirm changes to account / business details. */
@Controller('seller/profile-changes')
@UseGuards(JwtAuthGuard)
export class SellerProfileChangesController {
  constructor(private readonly service: ProfileChangesService) {}

  @Get()
  overview(@Req() req: any) {
    return this.service.overview(req.user.id);
  }

  @Post()
  create(@Req() req: any, @Body() body: CreateChangeRequestBody) {
    return this.service.create(req.user.id, body, requestMeta(req));
  }

  @Post(':id/verify')
  verify(@Req() req: any, @Param('id') id: string, @Body() body: { code: string }) {
    return this.service.verify(req.user.id, id, body?.code);
  }

  @Post(':id/resend')
  resend(@Req() req: any, @Param('id') id: string) {
    return this.service.resend(req.user.id, id);
  }

  @Post(':id/cancel')
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.service.cancel(req.user.id, id);
  }
}

/** Admin-facing: review queue for KYC-verified detail changes. */
@Controller('admin/profile-changes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminProfileChangesController {
  constructor(private readonly service: ProfileChangesService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.service.adminList(status);
  }

  @Post(':id/approve')
  approve(@Req() req: any, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.service.adminApprove(req.user.id, id, body?.note);
  }

  @Post(':id/reject')
  reject(@Req() req: any, @Param('id') id: string, @Body() body: { note: string }) {
    return this.service.adminReject(req.user.id, id, body?.note);
  }
}
