import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { NotificationsService } from './notifications.service';

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  getNotifications() {
    return this.service.getAdminNotifications();
  }

  /** Re-send a seller email that previously failed. */
  @Post('email-failures/:id/retry')
  retryEmailFailure(@Param('id') id: string, @Req() req: any) {
    return this.service.retryEmailFailure(id, req.user.id);
  }

  /** Clear a failed-email alert without re-sending. */
  @Post('email-failures/:id/dismiss')
  dismissEmailFailure(@Param('id') id: string, @Req() req: any) {
    return this.service.dismissEmailFailure(id, req.user.id);
  }
}
