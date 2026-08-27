import { BadRequestException, Body, Controller, ForbiddenException, Post, Req } from '@nestjs/common';
import { EmailService } from './email.service';

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  /** Sends rendered admin-dashboard templates through the central SMTP transport. */
  @Post('send')
  async sendEmail(
    @Req() req: any,
    @Body() body: { to: string[]; subject: string; html: string; replyTo?: string },
  ) {
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Administrator access is required to send email.');
    }

    if (!body || !Array.isArray(body.to) || body.to.length === 0 || body.to.length > 50 || body.to.some((email) => typeof email !== 'string' || !email.includes('@'))) {
      throw new BadRequestException('Provide between 1 and 50 valid recipient email addresses.');
    }
    if (!body.subject?.trim() || !body.html?.trim()) {
      throw new BadRequestException('Email subject and content are required.');
    }

    const messageId = await this.emailService.sendRenderedEmail({
      to: body.to,
      subject: body.subject,
      html: body.html,
      replyTo: body.replyTo,
    });
    return { success: true, messageId };
  }
}
