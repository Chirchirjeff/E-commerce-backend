import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import {
  CODE_TTL_MS,
  ChangeStatus,
  FIELD_BY_KEY,
  FieldDefinition,
  MAX_CODE_ATTEMPTS,
  MAX_REQUESTS_PER_FIELD_PER_DAY,
  OPEN_STATUSES,
  PROFILE_FIELDS,
  ProfileField,
} from './profile-changes.constants';

export interface CreateChangeRequestBody {
  field: ProfileField;
  newValue: string;
  reasonCode: string;
  reasonNote?: string;
  currentPassword: string;
  supportingDocUrl?: string;
}

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/** Columns safe to return to clients (never the code hash). */
const PUBLIC_SELECT = {
  id: true,
  reference: true,
  field: true,
  oldValue: true,
  newValue: true,
  reasonCode: true,
  reasonNote: true,
  supportingDocUrl: true,
  channel: true,
  status: true,
  codeExpiresAt: true,
  reviewNote: true,
  reviewedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ProfileChangesService {
  private readonly logger = new Logger(ProfileChangesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  // ───────────────────────────── Seller ─────────────────────────────

  /** Current details, the change catalog and the seller's request history. */
  async overview(userId: string) {
    await this.expireStaleCodes(userId);
    const user = await this.getSeller(userId);
    const requests = await this.db.profileChangeRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: PUBLIC_SELECT,
    });
    return {
      current: this.currentValues(user),
      kycStatus: user.kyc?.status ?? 'NOT_SUBMITTED',
      fields: PROFILE_FIELDS,
      requests,
    };
  }

  async create(userId: string, body: CreateChangeRequestBody, meta: RequestMeta) {
    const definition = FIELD_BY_KEY.get(body?.field);
    if (!definition) throw new BadRequestException('Choose which detail you want to change.');

    const user = await this.getSeller(userId);

    // Step-up authentication: always re-confirm the password for account changes.
    // 400 (not 401) so the seller app doesn't treat a typo as an expired session.
    if (!body.currentPassword || !(await bcrypt.compare(body.currentPassword, user.password))) {
      throw new BadRequestException('Your current password is incorrect.');
    }

    if (definition.requiresVerifiedKyc && user.kyc?.status !== 'VERIFIED') {
      throw new BadRequestException(
        user.kyc?.status === 'PENDING'
          ? 'Your business verification is still under review. You can request changes once it is approved.'
          : 'Business details can be changed after your business verification (KYC) is approved.',
      );
    }

    const reason = definition.reasons.find((r) => r.code === body.reasonCode);
    if (!reason) throw new BadRequestException('Choose a reason for this change.');
    const reasonNote = body.reasonNote?.trim() || null;
    if (reason.code === 'OTHER' && (!reasonNote || reasonNote.length < 10)) {
      throw new BadRequestException('Please describe the reason for this change (at least 10 characters).');
    }
    if (reasonNote && reasonNote.length > 500) {
      throw new BadRequestException('Keep the explanation under 500 characters.');
    }

    const current = this.currentValues(user)[definition.field] ?? null;
    const newValue = this.normalise(definition.field, body.newValue);
    if (current && this.same(definition.field, current, newValue)) {
      throw new BadRequestException(`That is already your ${definition.label.toLowerCase()}.`);
    }
    if (definition.field === 'EMAIL') await this.assertEmailAvailable(newValue, userId);

    const supportingDocUrl = body.supportingDocUrl?.trim() || null;
    if (supportingDocUrl && !/^https?:\/\/\S+$/i.test(supportingDocUrl)) {
      throw new BadRequestException('The supporting document link is invalid. Please upload it again.');
    }

    // Abuse limits: one open request per detail, and a daily cap.
    const openReview = await this.db.profileChangeRequest.findFirst({
      where: { userId, field: definition.field, status: 'PENDING_REVIEW' },
      select: { reference: true },
    });
    if (openReview) {
      throw new ConflictException(
        `You already have a ${definition.label.toLowerCase()} change under review (${openReview.reference}). Cancel it first to submit a new one.`,
      );
    }
    const recent = await this.db.profileChangeRequest.count({
      where: { userId, field: definition.field, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    if (recent >= MAX_REQUESTS_PER_FIELD_PER_DAY) {
      throw new BadRequestException(
        `You've made ${MAX_REQUESTS_PER_FIELD_PER_DAY} ${definition.label.toLowerCase()} change requests in the last 24 hours. Please try again tomorrow or contact support.`,
      );
    }

    // A fresh verification request replaces any unfinished one for the same detail.
    await this.db.profileChangeRequest.updateMany({
      where: { userId, field: definition.field, status: 'PENDING_VERIFICATION' },
      data: { status: 'CANCELLED', codeHash: null },
    });

    const isReview = definition.channel === 'ADMIN_REVIEW';
    const code = isReview ? null : this.generateCode();
    const request = await this.db.profileChangeRequest.create({
      data: {
        reference: await this.generateReference(),
        userId,
        field: definition.field,
        oldValue: current,
        newValue,
        reasonCode: reason.code,
        reasonNote,
        supportingDocUrl,
        channel: definition.channel,
        status: isReview ? 'PENDING_REVIEW' : 'PENDING_VERIFICATION',
        codeHash: code ? this.hash(code) : null,
        codeExpiresAt: code ? new Date(Date.now() + CODE_TTL_MS) : null,
        requestIp: meta.ip?.slice(0, 100) ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
      select: PUBLIC_SELECT,
    });

    if (code) {
      try {
        await this.sendCode(definition, request.reference, code, user, newValue);
      } catch (error) {
        // Don't leave a request the seller can never complete.
        await this.db.profileChangeRequest.update({
          where: { id: request.id },
          data: { status: 'CANCELLED', codeHash: null },
        });
        throw error;
      }
    } else {
      await this.notify(user.email, user.name, `We received your ${definition.label.toLowerCase()} change request`, [
        `Your request to change your ${definition.label.toLowerCase()} has been sent to the Quza team for review (reference <strong>${request.reference}</strong>).`,
        'Reviews usually take 1–2 business days. We will email you as soon as a decision is made.',
        "If you didn't make this request, change your password and contact support immediately.",
      ]);
    }

    return { request, codeSentTo: code ? this.codeDestination(definition, user, newValue) : null };
  }

  async verify(userId: string, requestId: string, rawCode: string) {
    const request = await this.getOwnOpenRequest(userId, requestId, 'PENDING_VERIFICATION');
    const definition = FIELD_BY_KEY.get(request.field as ProfileField)!;

    if (!request.codeExpiresAt || request.codeExpiresAt <= new Date()) {
      await this.setStatus(request.id, 'EXPIRED');
      throw new BadRequestException('This code has expired. Start the change again to get a new code.');
    }

    const code = String(rawCode ?? '').replace(/\D/g, '');
    const matches =
      code.length === 6 &&
      request.codeHash &&
      crypto.timingSafeEqual(Buffer.from(this.hash(code)), Buffer.from(request.codeHash));

    if (!matches) {
      const attempts = request.codeAttempts + 1;
      const exhausted = attempts >= MAX_CODE_ATTEMPTS;
      await this.db.profileChangeRequest.update({
        where: { id: request.id },
        data: { codeAttempts: attempts, ...(exhausted ? { status: 'EXPIRED', codeHash: null } : {}) },
      });
      throw new BadRequestException(
        exhausted
          ? 'Too many incorrect codes. For your security this request was closed — please start again.'
          : `That code is incorrect. ${MAX_CODE_ATTEMPTS - attempts} attempt(s) left.`,
      );
    }

    const user = await this.getSeller(userId);
    const applied = await this.apply(request.id, definition, request.oldValue, request.newValue, userId);

    const changedLabel = definition.label.toLowerCase();
    if (definition.field === 'EMAIL') {
      // Tell the OLD address — the standard defence against account takeover.
      await this.notify(request.oldValue ?? user.email, user.name, 'Your Quza login email was changed', [
        `The login email for your Quza seller account was changed to <strong>${this.escape(request.newValue)}</strong> (reference <strong>${request.reference}</strong>).`,
        "If you made this change, no action is needed. If you didn't, contact support immediately and quote the reference above.",
      ]);
    } else {
      await this.notify(user.email, user.name, `Your ${changedLabel} was updated`, [
        `Your ${changedLabel} was changed to <strong>${this.escape(request.newValue)}</strong> (reference <strong>${request.reference}</strong>).`,
        "If you didn't make this change, contact support immediately and quote the reference above.",
      ]);
    }

    return {
      request: await this.db.profileChangeRequest.findUnique({ where: { id: request.id }, select: PUBLIC_SELECT }),
      updated: applied,
      // The JWT carries the email, so issue a fresh one after an email change.
      ...(definition.field === 'EMAIL'
        ? { access_token: this.jwtService.sign({ sub: userId, email: request.newValue, isAdmin: false }) }
        : {}),
    };
  }

  async resend(userId: string, requestId: string) {
    const request = await this.getOwnOpenRequest(userId, requestId, 'PENDING_VERIFICATION');
    const definition = FIELD_BY_KEY.get(request.field as ProfileField)!;
    // Gentle throttle: one resend per minute.
    if (Date.now() - request.updatedAt.getTime() < 60_000) {
      throw new BadRequestException('Please wait a minute before requesting another code.');
    }
    const user = await this.getSeller(userId);
    const code = this.generateCode();
    await this.db.profileChangeRequest.update({
      where: { id: request.id },
      data: { codeHash: this.hash(code), codeExpiresAt: new Date(Date.now() + CODE_TTL_MS), codeAttempts: 0 },
    });
    await this.sendCode(definition, request.reference, code, user, request.newValue);
    return { codeSentTo: this.codeDestination(definition, user, request.newValue) };
  }

  async cancel(userId: string, requestId: string) {
    const request = await this.db.profileChangeRequest.findFirst({ where: { id: requestId, userId } });
    if (!request) throw new NotFoundException('Change request not found.');
    if (!OPEN_STATUSES.includes(request.status as ChangeStatus)) {
      throw new BadRequestException('This request is already closed.');
    }
    return this.db.profileChangeRequest.update({
      where: { id: request.id },
      data: { status: 'CANCELLED', codeHash: null },
      select: PUBLIC_SELECT,
    });
  }

  // ───────────────────────────── Admin ─────────────────────────────

  async adminList(status?: string) {
    const where = status && status !== 'ALL' ? { status } : {};
    const requests = await this.db.profileChangeRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
      select: {
        ...PUBLIC_SELECT,
        requestIp: true,
        reviewedBy: true,
        user: {
          select: {
            id: true, name: true, email: true, phone: true,
            kyc: { select: { businessName: true, status: true } },
            shops: { select: { id: true, name: true } },
          },
        },
      },
    });
    const counts = await this.db.profileChangeRequest.groupBy({ by: ['status'], _count: { _all: true } });
    return {
      requests: requests.map((r) => ({
        ...r,
        fieldLabel: FIELD_BY_KEY.get(r.field as ProfileField)?.label ?? r.field,
        reasonLabel:
          FIELD_BY_KEY.get(r.field as ProfileField)?.reasons.find((x) => x.code === r.reasonCode)?.label ?? r.reasonCode,
      })),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    };
  }

  async adminApprove(adminId: string, requestId: string, note?: string) {
    const request = await this.db.profileChangeRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Change request not found.');
    if (request.status !== 'PENDING_REVIEW') throw new BadRequestException('Only requests awaiting review can be approved.');
    const definition = FIELD_BY_KEY.get(request.field as ProfileField)!;
    const user = await this.getSeller(request.userId);

    const applied = await this.apply(request.id, definition, request.oldValue, request.newValue, request.userId, {
      reviewedBy: adminId,
      reviewNote: note?.trim() || null,
    });

    // Fire-and-forget — transaction already committed via apply(), so email
    // failure must never block the response or undo the approved change.
    void this.notify(user.email, user.name, `Your ${definition.label.toLowerCase()} change was approved`, [
      `Your request to change your ${definition.label.toLowerCase()} to <strong>${this.escape(request.newValue)}</strong> was approved (reference <strong>${request.reference}</strong>).`,
      ...(note?.trim() ? [`Note from the Quza team: ${this.escape(note.trim())}`] : []),
    ]);
    return { ok: true, updated: applied };
  }

  async adminReject(adminId: string, requestId: string, note: string) {
    if (!note?.trim()) throw new BadRequestException('Give the seller a reason for rejecting this request.');
    const request = await this.db.profileChangeRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Change request not found.');
    if (request.status !== 'PENDING_REVIEW') throw new BadRequestException('Only requests awaiting review can be rejected.');
    const definition = FIELD_BY_KEY.get(request.field as ProfileField)!;
    const user = await this.getSeller(request.userId);

    await this.db.profileChangeRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED', reviewedBy: adminId, reviewNote: note.trim(), reviewedAt: new Date() },
    });
    // Fire-and-forget — DB update already committed above.
    void this.notify(user.email, user.name, `Your ${definition.label.toLowerCase()} change was not approved`, [
      `We couldn't approve your request to change your ${definition.label.toLowerCase()} (reference <strong>${request.reference}</strong>).`,
      `<strong>Reason:</strong> ${this.escape(note.trim())}`,
      'You can submit a new request from Settings → Account once you have the right information or documents.',
    ]);
    return { ok: true };
  }

  // ───────────────────────────── Internals ─────────────────────────────

  /**
   * Writes the new value everywhere the detail is stored, in one transaction,
   * and marks the request completed. Returns where it was updated.
   */
  private async apply(
    requestId: string,
    definition: FieldDefinition,
    oldValue: string | null,
    newValue: string,
    userId: string,
    review?: { reviewedBy: string; reviewNote: string | null },
  ): Promise<string[]> {
    if (definition.field === 'EMAIL') await this.assertEmailAvailable(newValue, userId);

    return this.db.$transaction(async (tx) => {
      const updated: string[] = [];
      switch (definition.field) {
        case 'EMAIL': {
          await tx.user.update({ where: { id: userId }, data: { email: newValue, emailVerifiedAt: new Date() } });
          updated.push('Login email');
          if (oldValue) {
            const shops = await tx.shop.updateMany({
              where: { ownerId: userId, contactEmail: { equals: oldValue, mode: 'insensitive' } },
              data: { contactEmail: newValue },
            });
            if (shops.count) updated.push(`Contact email on ${shops.count} shop${shops.count > 1 ? 's' : ''}`);
          }
          break;
        }
        case 'PHONE': {
          await tx.user.update({ where: { id: userId }, data: { phone: newValue } });
          updated.push('Account phone');
          const matchesOld = oldValue ? { in: this.phoneVariants(oldValue) } : undefined;
          const kyc = await tx.kYC.updateMany({
            where: { userId, ...(matchesOld ? { phone: matchesOld } : {}) },
            data: { phone: newValue },
          });
          if (kyc.count) updated.push('Business verification (KYC) phone');
          if (matchesOld) {
            const shops = await tx.shop.updateMany({
              where: { ownerId: userId, contactPhone: matchesOld },
              data: { contactPhone: newValue },
            });
            if (shops.count) updated.push(`Contact phone on ${shops.count} shop${shops.count > 1 ? 's' : ''}`);
          }
          break;
        }
        case 'FULL_NAME':
          await tx.user.update({ where: { id: userId }, data: { name: newValue } });
          updated.push('Account name');
          break;
        case 'BUSINESS_NAME':
          await tx.kYC.update({ where: { userId }, data: { businessName: newValue } });
          updated.push('Business verification (KYC) record');
          break;
        case 'BUSINESS_ADDRESS':
          await tx.kYC.update({ where: { userId }, data: { businessAddress: newValue } });
          updated.push('Business verification (KYC) record');
          break;
        case 'TAX_ID':
          await tx.kYC.update({ where: { userId }, data: { taxId: newValue } });
          updated.push('Business verification (KYC) record');
          break;
      }
      await tx.profileChangeRequest.update({
        where: { id: requestId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          codeHash: null,
          ...(review ? { ...review, reviewedAt: new Date() } : {}),
        },
      });
      return updated;
    });
  }

  private async getSeller(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: { kyc: { select: { status: true, businessName: true, businessAddress: true, taxId: true, phone: true } } },
    });
    if (!user) throw new ForbiddenException('Seller account not found.');
    return user;
  }

  private currentValues(user: Awaited<ReturnType<ProfileChangesService['getSeller']>>): Record<ProfileField, string | null> {
    return {
      EMAIL: user.email,
      PHONE: user.phone ?? user.kyc?.phone ?? null,
      FULL_NAME: user.name,
      BUSINESS_NAME: user.kyc?.businessName ?? null,
      BUSINESS_ADDRESS: user.kyc?.businessAddress ?? null,
      TAX_ID: user.kyc?.taxId ?? null,
    };
  }

  private async getOwnOpenRequest(userId: string, requestId: string, status: ChangeStatus) {
    const request = await this.db.profileChangeRequest.findFirst({ where: { id: requestId, userId } });
    if (!request) throw new NotFoundException('Change request not found.');
    if (request.status !== status) {
      throw new BadRequestException('This request is no longer waiting for a code. Start the change again.');
    }
    return request;
  }

  private normalise(field: ProfileField, raw: unknown): string {
    const value = String(raw ?? '').trim().replace(/\s+/g, ' ');
    switch (field) {
      case 'EMAIL': {
        const email = value.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
          throw new BadRequestException('Enter a valid email address.');
        }
        return email;
      }
      case 'PHONE': {
        const phone = value.replace(/[\s()-]/g, '');
        if (!/^\+?\d{9,15}$/.test(phone)) {
          throw new BadRequestException('Enter a valid phone number, e.g. 0712 345 678 or +254712345678.');
        }
        return phone;
      }
      case 'FULL_NAME':
        if (value.length < 2 || value.length > 100) throw new BadRequestException('Enter your full name (2–100 characters).');
        return value;
      case 'BUSINESS_NAME':
        if (value.length < 2 || value.length > 120) throw new BadRequestException('Enter the business name (2–120 characters).');
        return value;
      case 'BUSINESS_ADDRESS':
        if (value.length < 5 || value.length > 250) throw new BadRequestException('Enter the full business address (5–250 characters).');
        return value;
      case 'TAX_ID': {
        const pin = value.replace(/\s/g, '').toUpperCase();
        if (!/^[A-Z0-9-]{5,30}$/.test(pin)) throw new BadRequestException('Enter a valid tax ID / KRA PIN, e.g. A012345678Z.');
        return pin;
      }
    }
  }

  private same(field: ProfileField, a: string, b: string) {
    if (field === 'EMAIL' || field === 'TAX_ID') return a.toLowerCase() === b.toLowerCase();
    if (field === 'PHONE') return this.phoneVariants(a).includes(b);
    return a.trim() === b.trim();
  }

  /** Common spellings of the same Kenyan number (0712…, 254712…, +254712…). */
  private phoneVariants(phone: string): string[] {
    const digits = phone.replace(/[^\d]/g, '');
    const local = digits.startsWith('254') ? digits.slice(3) : digits.replace(/^0/, '');
    return Array.from(new Set([phone, digits, `0${local}`, `254${local}`, `+254${local}`]));
  }

  private async assertEmailAvailable(email: string, userId: string) {
    const taken = await this.db.user.findFirst({ where: { email, NOT: { id: userId } }, select: { id: true } });
    if (taken) throw new ConflictException('That email address is already used by another Quza account.');
  }

  private async expireStaleCodes(userId: string) {
    await this.db.profileChangeRequest.updateMany({
      where: { userId, status: 'PENDING_VERIFICATION', codeExpiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED', codeHash: null },
    });
  }

  private setStatus(id: string, status: ChangeStatus) {
    return this.db.profileChangeRequest.update({ where: { id }, data: { status, codeHash: null } });
  }

  private codeDestination(definition: FieldDefinition, user: { email: string }, newValue: string) {
    const to = definition.channel === 'OTP_NEW_EMAIL' ? newValue : user.email;
    const [name, domain] = to.split('@');
    return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
  }

  private async sendCode(
    definition: FieldDefinition,
    reference: string,
    code: string,
    user: { email: string; name: string },
    newValue: string,
  ) {
    const to = definition.channel === 'OTP_NEW_EMAIL' ? newValue : user.email;
    const what =
      definition.field === 'EMAIL'
        ? `change your Quza login email to <strong>${this.escape(newValue)}</strong>`
        : `change your ${definition.label.toLowerCase()} to <strong>${this.escape(newValue)}</strong>`;
    await this.emailService.sendSellerSecurityCodeEmail({
      recipientEmail: to,
      recipientName: user.name,
      code,
      action: what,
      reference,
    });
  }

  private async notify(to: string, name: string, subject: string, paragraphs: string[]) {
    await this.emailService.sendSellerNoticeEmail({ recipientEmail: to, recipientName: name, subject, paragraphs });
  }

  private generateCode() {
    return crypto.randomInt(100000, 1_000_000).toString();
  }

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private async generateReference() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 5; i++) {
      const ref = 'PCR-' + Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
      const exists = await this.db.profileChangeRequest.findUnique({ where: { reference: ref }, select: { id: true } });
      if (!exists) return ref;
    }
    this.logger.warn('Falling back to UUID-based change reference');
    return 'PCR-' + crypto.randomUUID().slice(0, 8).toUpperCase();
  }

  private escape(value: string) {
    return value.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!);
  }
}
