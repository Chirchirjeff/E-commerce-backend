import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

interface KycStatusEmail {
  recipientEmail: string;
  recipientName: string;
  businessName: string;
  outcome: 'approved' | 'rejected';
  reason?: string;
}

interface BuyerCodeEmail {
  recipientEmail: string;
  recipientName: string;
  code: string;
  purpose: 'verify-email' | 'login';
}

interface BuyerPasswordResetEmail {
  recipientEmail: string;
  recipientName: string;
  resetUrl: string;
}

interface PaymentReceivedEmail {
  recipientEmail: string;
  recipientName: string;
  orderNumber: string;
  amount: number;
  trackingUrl: string;
  mpesaReceiptNumber?: string;
}

interface RenderedEmail {
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character];
  });
}

/** Sends transactional email without allowing delivery failures to undo KYC decisions. */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) return this.transporter;

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass || !Number.isFinite(port)) {
      throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS must be configured.');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    return this.transporter;
  }

  private getFromAddress(): string {
    const from = process.env.SMTP_FROM;
    if (!from) throw new Error('SMTP_FROM must be configured.');
    return from;
  }

  async sendRenderedEmail(email: RenderedEmail): Promise<string | undefined> {
    try {
      const result = await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email.to,
        subject: email.subject,
        html: email.html,
        ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      });
      return result.messageId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Admin email failed: ${message}`);
      throw new ServiceUnavailableException('Email delivery is temporarily unavailable. Please try again shortly.');
    }
  }

  async sendKycStatusEmail(email: KycStatusEmail): Promise<void> {
    const recipientName = escapeHtml(email.recipientName);
    const businessName = escapeHtml(email.businessName);
    const isApproved = email.outcome === 'approved';
    const subject = isApproved
      ? `Your Quza seller KYC has been approved, ${email.recipientName}`
      : `Action required: your Quza seller KYC was declined`;
    const heading = isApproved ? 'Your seller account is verified' : 'Your KYC needs attention';
    const body = isApproved
      ? `Great news — <strong>${businessName}</strong> has been verified and is ready to sell on Quza.`
      : `We could not verify <strong>${businessName}</strong> at this time. Please review the reason below, update your documents, and submit your KYC again.`;
    const reason = !isApproved && email.reason
      ? `<p style="margin:24px 0 0;padding:16px;background:#fff7ed;border-left:4px solid #ea580c"><strong>Review note:</strong><br />${escapeHtml(email.reason)}</p>`
      : '';

    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email.recipientEmail,
        subject,
        html: `<!doctype html><html><body style="margin:0;padding:32px;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b"><main style="max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:32px"><h1 style="margin:0 0 20px;color:#0f766e;font-size:24px">${heading}</h1><p>Hello ${recipientName},</p><p>${body}</p>${reason}<p style="margin:28px 0 0">Regards,<br /><strong>The Quza Team</strong></p></main></body></html>`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`KYC ${email.outcome} email failed: ${message}`);
    }
  }

  async sendBuyerCodeEmail(email: BuyerCodeEmail): Promise<void> {
    const name = escapeHtml(email.recipientName);
    const isLogin = email.purpose === 'login';
    const subject = isLogin ? 'Your Quza sign-in code' : 'Verify your Quza email address';
    const heading = isLogin ? 'Sign in to Quza' : 'Verify your email address';
    const message = isLogin
      ? 'Use this one-time code to finish signing in. '
      : 'Use this one-time code to verify your new Quza buyer account. ';

    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email.recipientEmail,
        subject,
        html: `<!doctype html><html><body style="margin:0;padding:32px;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b"><main style="max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:32px"><h1 style="margin:0 0 20px;color:#0f766e;font-size:24px">${heading}</h1><p>Hello ${name},</p><p>${message}It expires in 10 minutes.</p><p style="margin:28px 0;padding:16px;text-align:center;border-radius:8px;background:#f0fdfa;color:#115e59;font-family:monospace;font-size:30px;font-weight:bold;letter-spacing:6px">${email.code}</p><p>If you did not request this, you can safely ignore this email.</p><p style="margin:28px 0 0">Regards,<br /><strong>The Quza Team</strong></p></main></body></html>`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Buyer ${email.purpose} email failed: ${message}`);
      throw new ServiceUnavailableException(
        'We could not send a verification email. Please confirm your email address and try again.',
      );
    }
  }

  async sendBuyerPasswordResetEmail(email: BuyerPasswordResetEmail): Promise<void> {
    const name = escapeHtml(email.recipientName);
    const resetUrl = escapeHtml(email.resetUrl);
    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email.recipientEmail,
        subject: 'Reset your Quza password',
        html: `<!doctype html><html><body style="margin:0;padding:32px;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b"><main style="max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:32px"><h1 style="margin:0 0 20px;color:#0f766e;font-size:24px">Reset your password</h1><p>Hello ${name},</p><p>We received a request to reset the password for your Quza buyer account. This link expires in one hour and can be used once.</p><p style="margin:28px 0"><a href="${resetUrl}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Choose a new password</a></p><p style="font-size:14px;color:#475569">If you did not request this, you can safely ignore this email. Your password will not change.</p><p style="margin:28px 0 0">Regards,<br /><strong>The Quza Team</strong></p></main></body></html>`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Buyer password reset email failed: ${message}`);
      throw new ServiceUnavailableException(
        'We could not send a password-reset email. Please try again shortly.',
      );
    }
  }

  /**
   * Sends the buyer their payment receipt and account-protected tracking page after the
   * paid order has been committed. Delivery errors are intentionally contained
   * so they never affect an already-confirmed M-Pesa payment.
   */
  async sendPaymentReceivedEmail(email: PaymentReceivedEmail): Promise<void> {
    const recipientName = escapeHtml(email.recipientName);
    const orderNumber = escapeHtml(email.orderNumber);
    const trackingUrl = escapeHtml(email.trackingUrl);
    const receipt = email.mpesaReceiptNumber
      ? `<p><strong>M-Pesa receipt:</strong> ${escapeHtml(email.mpesaReceiptNumber)}</p>`
      : '';

    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email.recipientEmail,
        subject: `Payment received for order ${email.orderNumber}`,
        html: `<!doctype html><html><body style="margin:0;padding:32px;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b"><main style="max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:32px"><h1 style="margin:0 0 20px;color:#0f766e;font-size:24px">Payment received</h1><p>Hello ${recipientName},</p><p>We have received your payment of <strong>KES ${email.amount.toLocaleString('en-KE')}</strong> for order <strong>${orderNumber}</strong>.</p>${receipt}<p style="margin:24px 0 12px">To track this order later, sign in to your verified Quza account and enter this order number:</p><p style="margin:0;padding:14px;text-align:center;border-radius:8px;background:#f0fdfa;color:#115e59;font-family:monospace;font-size:20px;font-weight:bold">${orderNumber}</p><p style="margin:24px 0 12px"><a href="${trackingUrl}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Track your order</a></p><p style="margin:24px 0 0;color:#475569;font-size:14px">For your privacy, you will be asked to sign in and verify your account before viewing the order.</p><p style="margin:28px 0 0">Regards,<br /><strong>The Quza Team</strong></p></main></body></html>`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Payment receipt email failed for order ${email.orderNumber}: ${message}`);
    }
  }
}
