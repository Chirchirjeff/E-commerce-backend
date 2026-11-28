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
  purpose: 'verify-email' | 'login' | 'change-email';
}

interface PasswordResetCodeEmail {
  recipientEmail: string;
  recipientName: string;
  code: string;
}

interface EmailChangedNotice {
  recipientEmail: string;
  recipientName: string;
  newEmail: string;
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

interface SellerSecurityCodeEmail {
  recipientEmail: string;
  recipientName: string;
  code: string;
  /** Pre-escaped HTML fragment, e.g. "change your phone number to <strong>…</strong>". */
  action: string;
  reference: string;
}

interface SellerNoticeEmail {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  /** Pre-escaped HTML paragraphs — callers must escape any user-supplied text. */
  paragraphs: string[];
}

interface LoginAlertEmail {
  recipientEmail: string;
  recipientName: string;
  /** Differentiates the copy and badge shown in the email. */
  userType: 'buyer' | 'seller' | 'admin';
  /** ISO timestamp of the login event. */
  loginAt: string;
}

export interface EmailSendResult {
  sent: boolean;
  error?: string;
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
      // Fail fast: callers wait on the result to tell the admin what happened.
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
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

  /**
   * Sends the approval / rejection email. Never throws — the KYC decision is
   * already committed — but reports whether delivery succeeded so the caller
   * can alert an admin instead of failing silently.
   */
  async sendKycStatusEmail(email: KycStatusEmail): Promise<EmailSendResult> {
    const recipientName = escapeHtml(email.recipientName);
    const businessName = escapeHtml(email.businessName);
    const isApproved = email.outcome === 'approved';
    const subject = isApproved
      ? `Your Quzaurban seller KYC has been approved, ${email.recipientName}`
      : `Action required: your Quzaurban seller KYC was declined`;
    const heading = isApproved ? 'Your seller account is verified' : 'Your KYC needs attention';
    const body = isApproved
      ? `Great news — <strong>${businessName}</strong> has been verified and is ready to sell on Quzaurban.`
      : `We could not verify <strong>${businessName}</strong> at this time. Please review the reason below, update your documents, and submit your KYC again.`;
    const reason = !isApproved && email.reason
      ? `<p style="margin:24px 0 0;padding:16px;background:#fff7ed;border-left:4px solid #ea580c"><strong>Review note:</strong><br />${escapeHtml(email.reason)}</p>`
      : '';

    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email.recipientEmail,
        subject,
        html: `<!doctype html><html><body style="margin:0;padding:32px;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b"><main style="max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:32px"><h1 style="margin:0 0 20px;color:#6535cc;font-size:24px">${heading}</h1><p>Hello ${recipientName},</p><p>${body}</p>${reason}<p style="margin:28px 0 0">Regards,<br /><strong>The Quzaurban Team</strong></p></main></body></html>`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`KYC ${email.outcome} email failed: ${message}`);
      return { sent: false, error: message };
    }
    return { sent: true };
  }

  async sendBuyerCodeEmail(email: BuyerCodeEmail): Promise<void> {
    const name = escapeHtml(email.recipientName);
    const isLogin = email.purpose === 'login';
    const isChange = email.purpose === 'change-email';
    const subject = isLogin
      ? 'Your Quzaurban sign-in code'
      : isChange
        ? 'Confirm your new Quzaurban email address'
        : 'Verify your Quzaurban email address';
    const heading = isLogin
      ? 'Sign in to Quzaurban'
      : isChange
        ? 'Confirm your new email address'
        : 'Verify your email address';
    const message = isLogin
      ? 'Use this one-time code to finish signing in. '
      : isChange
        ? 'Use this one-time code to make this the email address for your Quzaurban account. '
        : 'Use this one-time code to verify your new Quzaurban buyer account. ';

    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email.recipientEmail,
        subject,
        html: `<!doctype html><html><body style="margin:0;padding:32px;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b"><main style="max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:32px"><h1 style="margin:0 0 20px;color:#6535cc;font-size:24px">${heading}</h1><p>Hello ${name},</p><p>${message}It expires in 10 minutes.</p><p style="margin:28px 0;padding:16px;text-align:center;border-radius:8px;background:#f7f5ff;color:#542da6;font-family:monospace;font-size:30px;font-weight:bold;letter-spacing:6px">${email.code}</p><p>If you did not request this, you can safely ignore this email.</p><p style="margin:28px 0 0">Regards,<br /><strong>The Quzaurban Team</strong></p></main></body></html>`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Buyer ${email.purpose} email failed: ${message}`);
      throw new ServiceUnavailableException(
        'We could not send a verification email. Please confirm your email address and try again.',
      );
    }
  }

  async sendPasswordResetCodeEmail(email: PasswordResetCodeEmail): Promise<void> {
    const name = escapeHtml(email.recipientName);
    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email.recipientEmail,
        subject: `${email.code} is your Quzaurban password reset code`,
        html: `<!doctype html><html><body style="margin:0;padding:32px;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b"><main style="max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:32px"><h1 style="margin:0 0 20px;color:#6535cc;font-size:24px">Reset your password</h1><p>Hello ${name},</p><p>Use this code to choose a new password for your Quzaurban account. It expires in 15 minutes and can be used once.</p><p style="margin:28px 0;padding:16px;text-align:center;border-radius:8px;background:#f7f5ff;color:#542da6;font-family:monospace;font-size:30px;font-weight:bold;letter-spacing:6px">${email.code}</p><p style="font-size:14px;color:#475569">If you didn’t ask to reset your password, you can ignore this email — your password won’t change. Never share this code with anyone, including people claiming to be from Quzaurban.</p><p style="margin:28px 0 0">Regards,<br /><strong>The Quzaurban Team</strong></p></main></body></html>`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Password reset code email failed: ${message}`);
      throw new ServiceUnavailableException(
        'We could not send a password-reset email. Please try again shortly.',
      );
    }
  }

  /** Tells the previous address that the account email was changed. */
  async sendEmailChangedNotice(email: EmailChangedNotice): Promise<void> {
    const name = escapeHtml(email.recipientName);
    const newEmail = escapeHtml(email.newEmail);
    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email.recipientEmail,
        subject: 'Your Quzaurban email address was changed',
        html: `<!doctype html><html><body style="margin:0;padding:32px;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b"><main style="max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:32px"><h1 style="margin:0 0 20px;color:#6535cc;font-size:24px">Your email address was changed</h1><p>Hello ${name},</p><p>The email address for your Quzaurban account is now <strong>${newEmail}</strong>. Sign-in codes, receipts and order updates will go there from now on.</p><p style="font-size:14px;color:#475569">If you did not make this change, reply to this email straight away so we can secure your account.</p><p style="margin:28px 0 0">Regards,<br /><strong>The Quzaurban Team</strong></p></main></body></html>`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Email-changed notice failed: ${message}`);
    }
  }

  async sendBuyerPasswordResetEmail(email: BuyerPasswordResetEmail): Promise<void> {
    const name = escapeHtml(email.recipientName);
    const resetUrl = escapeHtml(email.resetUrl);
    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email.recipientEmail,
        subject: 'Reset your Quzaurban password',
        html: `<!doctype html><html><body style="margin:0;padding:32px;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b"><main style="max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:32px"><h1 style="margin:0 0 20px;color:#6535cc;font-size:24px">Reset your password</h1><p>Hello ${name},</p><p>We received a request to reset the password for your Quzaurban buyer account. This link expires in one hour and can be used once.</p><p style="margin:28px 0"><a href="${resetUrl}" style="display:inline-block;background:#6535cc;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Choose a new password</a></p><p style="font-size:14px;color:#475569">If you did not request this, you can safely ignore this email. Your password will not change.</p><p style="margin:28px 0 0">Regards,<br /><strong>The Quzaurban Team</strong></p></main></body></html>`,
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
        html: `<!doctype html><html><body style="margin:0;padding:32px;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b"><main style="max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:32px"><h1 style="margin:0 0 20px;color:#6535cc;font-size:24px">Payment received</h1><p>Hello ${recipientName},</p><p>We have received your payment of <strong>KES ${email.amount.toLocaleString('en-KE')}</strong> for order <strong>${orderNumber}</strong>.</p>${receipt}<p style="margin:24px 0 12px">To track this order later, sign in to your verified Quzaurban account and enter this order number:</p><p style="margin:0;padding:14px;text-align:center;border-radius:8px;background:#f7f5ff;color:#542da6;font-family:monospace;font-size:20px;font-weight:bold">${orderNumber}</p><p style="margin:24px 0 12px"><a href="${trackingUrl}" style="display:inline-block;background:#6535cc;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Track your order</a></p><p style="margin:24px 0 0;color:#475569;font-size:14px">For your privacy, you will be asked to sign in and verify your account before viewing the order.</p><p style="margin:28px 0 0">Regards,<br /><strong>The Quzaurban Team</strong></p></main></body></html>`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Payment receipt email failed for order ${email.orderNumber}: ${message}`);
    }
  }

  private sellerLayout(heading: string, name: string, body: string) {
    return `<!doctype html><html><body style="margin:0;padding:32px;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b"><main style="max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:32px"><h1 style="margin:0 0 20px;color:#6535cc;font-size:24px">${heading}</h1><p>Hello ${escapeHtml(name)},</p>${body}<p style="margin:28px 0 0">Regards,<br /><strong>The Quzaurban Team</strong></p></main></body></html>`;
  }

  /** One-time code confirming a seller account change. Throws if it can't be sent. */
  async sendSellerSecurityCodeEmail(email: SellerSecurityCodeEmail): Promise<void> {
    const body = `<p>We received a request to ${email.action} (reference <strong>${escapeHtml(email.reference)}</strong>).</p><p>Enter this code in your seller dashboard to confirm. It expires in 10 minutes.</p><p style="margin:28px 0;padding:16px;text-align:center;border-radius:8px;background:#f7f5ff;color:#542da6;font-family:monospace;font-size:30px;font-weight:bold;letter-spacing:6px">${escapeHtml(email.code)}</p><p><strong>Never share this code.</strong> Quzaurban staff will never ask for it. If you didn't request this change, ignore this email and change your password.</p>`;
    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email.recipientEmail,
        subject: `Your Quzaurban verification code: ${email.code}`,
        html: this.sellerLayout('Confirm your account change', email.recipientName, body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Seller security code email failed: ${message}`);
      throw new ServiceUnavailableException('We could not send the verification code. Check the email address and try again.');
    }
  }

  /** Informational seller account notice. Delivery failures are logged, not thrown. */
  async sendSellerNoticeEmail(email: SellerNoticeEmail): Promise<void> {
    const body = email.paragraphs.map((p) => `<p>${p}</p>`).join('');
    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email.recipientEmail,
        subject: email.subject,
        html: this.sellerLayout(escapeHtml(email.subject), email.recipientName, body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Seller notice email failed (${email.subject}): ${message}`);
    }
  }

  /**
   * Sends a "new sign-in detected" security notice immediately after a
   * successful login. Delivery failures are logged but never thrown — the
   * login token has already been issued and must not be invalidated.
   */
  async sendLoginAlertEmail(email: LoginAlertEmail): Promise<void> {
    const name = escapeHtml(email.recipientName);

    const badgeColor: Record<LoginAlertEmail['userType'], string> = {
      admin:  '#dc2626',   // red   — highest privilege
      seller: '#d97706',   // amber — elevated
      buyer:  '#2563eb',   // blue  — standard
    };
    const badgeLabel: Record<LoginAlertEmail['userType'], string> = {
      admin:  'Admin',
      seller: 'Seller',
      buyer:  'Buyer',
    };
    const dashboardLabel: Record<LoginAlertEmail['userType'], string> = {
      admin:  'Admin dashboard',
      seller: 'Seller dashboard',
      buyer:  'Your account',
    };

    // Format the timestamp in a human-readable, timezone-agnostic way.
    const when = new Date(email.loginAt).toUTCString().replace(' GMT', ' UTC');

    const badge = `<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;letter-spacing:.4px;background:${badgeColor[email.userType]}22;color:${badgeColor[email.userType]};border:1px solid ${badgeColor[email.userType]}44">${badgeLabel[email.userType]}</span>`;

    const html = `<!doctype html>
<html>
<body style="margin:0;padding:32px;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b">
  <main style="max-width:600px;margin:auto;background:#fff;border-radius:12px;overflow:hidden">

    <!-- Header band -->
    <div style="background:#1a1033;padding:24px 32px;display:flex;align-items:center;gap:12px">
      <span style="font-size:20px;font-weight:700;color:#f8fafc;letter-spacing:-.3px">Quzaurban</span>
      <span style="margin-left:8px">${badge}</span>
    </div>

    <!-- Body -->
    <div style="padding:32px">
      <h1 style="margin:0 0 8px;color:#1e293b;font-size:20px;font-weight:700">New sign-in to your account</h1>
      <p style="margin:0 0 24px;color:#64748b;font-size:14px">We noticed a successful login to your Quzaurban ${badgeLabel[email.userType].toLowerCase()} account.</p>

      <p style="margin:0 0 6px;font-size:15px">Hello ${name},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569">Your account was just signed in to. If this was you, no action is needed.</p>

      <!-- Detail card -->
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:14px">
        <tbody>
          <tr style="background:#f8fafc">
            <td style="padding:12px 16px;color:#64748b;font-weight:600;width:40%;border-bottom:1px solid #e2e8f0">Account type</td>
            <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0">${badge}</td>
          </tr>
          <tr>
            <td style="padding:12px 16px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0">Email</td>
            <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-family:monospace">${escapeHtml(email.recipientEmail)}</td>
          </tr>
          <tr style="background:#f8fafc">
            <td style="padding:12px 16px;color:#64748b;font-weight:600">Time</td>
            <td style="padding:12px 16px">${when}</td>
          </tr>
        </tbody>
      </table>

      <!-- Warning block -->
      <div style="margin:24px 0 0;padding:16px;background:#fff7ed;border-left:4px solid #ea580c;border-radius:0 6px 6px 0">
        <p style="margin:0 0 6px;font-weight:700;color:#9a3412;font-size:14px">Wasn't you?</p>
        <p style="margin:0;color:#9a3412;font-size:14px">Change your password immediately and contact us at <a href="mailto:support@quzaurban.com" style="color:#9a3412">support@quzaurban.com</a>. Do not share your password with anyone.</p>
      </div>

      <p style="margin:28px 0 0;font-size:14px;color:#64748b">
        This is an automated security notice from Quzaurban.
        You received it because a login was detected on your account.<br />
        <a href="mailto:support@quzaurban.com" style="color:#6535cc">Contact support</a> if you have any questions.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
      <p style="margin:0;font-size:12px;color:#94a3b8">© ${new Date().getFullYear()} Quzaurban. All rights reserved. · 123 Commerce Street, Nairobi, Kenya</p>
    </div>

  </main>
</body>
</html>`;

    try {
      await this.getTransporter().sendMail({
        from: this.getFromAddress(),
        to: email.recipientEmail,
        subject: `New sign-in to your Quzaurban ${badgeLabel[email.userType].toLowerCase()} account`,
        html,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Log only — a delivery failure must never roll back a completed login.
      this.logger.warn(`Login alert email failed for ${email.recipientEmail}: ${message}`);
    }
  }
}
