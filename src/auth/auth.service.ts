import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { EmailService } from '../email/email.service';
import {
  cloudinaryPublicId,
  destroyCloudinaryImage,
  uploadAvatarToCloudinary,
} from '../lib/cloudinary';
import { normalizeUsername, usernameBase, usernameProblem } from './username';

/** Fields every client reads for the signed-in account. */
const ACCOUNT_SELECT = {
  id: true,
  name: true,
  username: true,
  avatarUrl: true,
  email: true,
  phone: true,
  emailVerifiedAt: true,
  addresses: { orderBy: [{ isDefault: 'desc' as const }, { updatedAt: 'desc' as const }] },
  createdAt: true,
};

/** Wrong guesses allowed before a one-time code is burned. */
const MAX_CODE_ATTEMPTS = 5;

const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_RESEND_MS = 60 * 1000;

const EMAIL_CHANGE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CHANGE_RESEND_MS = 60 * 1000;

/** Maximum saved delivery addresses per buyer (keep in sync with the webapp). */
export const MAX_BUYER_ADDRESSES = 5;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  // ========================================
  // ADMIN AUTHENTICATION
  // ========================================

  async adminLogin(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Find admin with role and permissions
    const admin = await this.prisma.client.admin.findUnique({
      where: { email: normalizedEmail },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!admin.isActive) {
      throw new ForbiddenException('Your account has been deactivated');
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Update last login
    await this.prisma.client.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    // Extract permissions
    const permissions = admin.role.permissions.map(
      (rp) => rp.permission.name,
    );

    // Generate token
    const payload = { 
      sub: admin.id, 
      email: admin.email, 
      role: admin.role.name,
      isAdmin: true,
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      access_token: accessToken,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role.name,
        roleId: admin.roleId,
      },
      permissions,
    };
  }

  // ========================================
  // SELLER (USER) AUTHENTICATION
  // ========================================

  async register(body: any) {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const name = String(body.name ?? '').trim();

    if (!name) {
      throw new BadRequestException('Please enter your full name');
    }

    if (!email || !email.includes('@')) {
      throw new BadRequestException('Please enter a valid email address');
    }

    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    // Check if user already exists
    const existingUser = await this.prisma.client.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    // Hash the password securely
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save user to database
    let user;
    try {
      user = await this.prisma.client.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }

    return this.generateToken(user.id, user.email);
  }

  async sellerLogin(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.prisma.client.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.generateToken(user.id, user.email);
  }

  // ========================================
  // BUYER AUTHENTICATION (global across all shops)
  // ========================================

  async registerBuyer(body: { name: string; email: string; password: string; phone?: string }) {
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const phone = String(body.phone ?? '').trim() || null;
    if (!name) throw new BadRequestException('Please enter your full name');
    if (!email || !email.includes('@')) throw new BadRequestException('Please enter a valid email address');
    if (password.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    const existing = await this.prisma.client.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with this email already exists. Please sign in.');

    const user = await this.prisma.client.user.create({
      data: {
        name,
        email,
        phone,
        username: await this.availableUsername(usernameBase(name, email)),
        password: await bcrypt.hash(password, 10),
      },
    });
    try {
      await this.issueBuyerCode(user.id, user.email, user.name, 'VERIFY_EMAIL');
    } catch (error) {
      // Do not leave an unusable account behind when the verification email
      // cannot be delivered; the buyer can retry registration after the issue
      // has been resolved.
      await this.prisma.client.user.delete({ where: { id: user.id } });
      throw error;
    }
    return { verificationRequired: true, email: user.email };
  }

  async beginBuyerLogin(body: { email: string; password: string }) {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException(
        'No buyer account is registered with this email. Please create an account before paying.',
      );
    }
    if (!(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.issueBuyerCode(user.id, user.email, user.name, user.emailVerifiedAt ? 'LOGIN' : 'VERIFY_EMAIL');
    return { verificationRequired: true, email: user.email, purpose: user.emailVerifiedAt ? 'LOGIN' : 'VERIFY_EMAIL' };
  }

  async verifyBuyerCode(body: { email: string; code: string; purpose: 'LOGIN' | 'VERIFY_EMAIL' }) {
    const email = String(body.email ?? '').trim().toLowerCase();
    const code = String(body.code ?? '').trim();
    const purpose = body.purpose === 'LOGIN' ? 'LOGIN' : 'VERIFY_EMAIL';
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid verification request');

    const verification = await this.prisma.client.authVerificationCode.findFirst({
      where: { userId: user.id, purpose, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification || !(await this.codeMatches(verification, code))) {
      throw new UnauthorizedException('The verification code is invalid or expired');
    }
    await this.prisma.client.$transaction([
      this.prisma.client.authVerificationCode.update({ where: { id: verification.id }, data: { usedAt: new Date() } }),
      this.prisma.client.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } }),
    ]);
    return this.generateToken(user.id, user.email);
  }

  // ── Password reset (any account in the users table: buyers and sellers) ──
  // A 6-digit code is emailed; the buyer/seller types it into whichever app
  // they are using (Mall, webapp, seller portal). Responses never reveal
  // whether an email is registered.

  async requestPasswordReset(rawEmail: string) {
    const email = String(rawEmail ?? '').trim().toLowerCase();
    const confirmation = {
      message: 'If an account exists for this email address, we sent it a 6-digit reset code.',
      expiresInSeconds: PASSWORD_RESET_TTL_MS / 1000,
    };
    if (!email || !email.includes('@')) return confirmation;

    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user) return confirmation;

    // Quietly skip re-sends inside the cool-down so the inbox isn't flooded.
    const recent = await this.prisma.client.authVerificationCode.findFirst({
      where: {
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        createdAt: { gt: new Date(Date.now() - PASSWORD_RESET_RESEND_MS) },
      },
      select: { id: true },
    });
    if (recent) return confirmation;

    const code = crypto.randomInt(100000, 1_000_000).toString();
    await this.prisma.client.authVerificationCode.updateMany({
      where: { userId: user.id, purpose: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: new Date() },
    });
    const row = await this.prisma.client.authVerificationCode.create({
      data: {
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        codeHash: this.hashCode(code),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });
    try {
      await this.emailService.sendPasswordResetCodeEmail({
        recipientEmail: user.email,
        recipientName: user.name,
        code,
      });
    } catch (error) {
      await this.prisma.client.authVerificationCode.delete({ where: { id: row.id } });
      throw error;
    }
    return confirmation;
  }

  /** Optional step: checks a code before the new password is chosen. */
  async verifyPasswordResetCode(rawEmail: string, rawCode: string) {
    await this.findPasswordResetCode(rawEmail, rawCode);
    return { valid: true };
  }

  /**
   * Sets the new password. Accepts { email, code } (current flow) or the
   * { token } from reset links emailed before codes replaced them.
   */
  async confirmPasswordReset(body: { email?: string; code?: string; token?: string; password: string }) {
    const password = String(body.password ?? '');
    if (password.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    let reset: { id: string; userId: string };
    if (body.token && !body.code) {
      const legacy = await this.prisma.client.authVerificationCode.findFirst({
        where: {
          purpose: 'PASSWORD_RESET',
          codeHash: this.hashCode(String(body.token).trim()),
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!legacy) throw new BadRequestException('This password-reset link is invalid or has expired.');
      reset = legacy;
    } else {
      reset = await this.findPasswordResetCode(body.email ?? '', body.code ?? '');
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: reset.userId },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (!user) throw new BadRequestException('The reset code is invalid or has expired');

    await this.prisma.client.$transaction([
      this.prisma.client.user.update({
        where: { id: user.id },
        data: {
          password: await bcrypt.hash(password, 10),
          // Receiving the code proves the buyer owns the address.
          ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
        },
      }),
      // Burn this and any other outstanding codes for the account.
      this.prisma.client.authVerificationCode.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
    return {
      message: 'Your password has been changed.',
      ...this.generateToken(user.id, user.email),
    };
  }

  private async findPasswordResetCode(rawEmail: string, rawCode: string) {
    const email = String(rawEmail ?? '').trim().toLowerCase();
    const code = String(rawCode ?? '').trim();
    const invalid = new BadRequestException('The reset code is invalid or has expired');
    if (!email) throw invalid;
    const user = await this.prisma.client.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw invalid;
    const row = await this.prisma.client.authVerificationCode.findFirst({
      where: { userId: user.id, purpose: 'PASSWORD_RESET', usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || !(await this.codeMatches(row, code))) throw invalid;
    return row;
  }

  /**
   * Constant-time code check that counts wrong guesses and burns the code
   * after MAX_CODE_ATTEMPTS, so a 6-digit code can't be brute-forced.
   */
  private async codeMatches(row: { id: string; codeHash: string }, code: string): Promise<boolean> {
    const ok =
      /^\d{6}$/.test(code) &&
      crypto.timingSafeEqual(Buffer.from(row.codeHash), Buffer.from(this.hashCode(code)));
    if (ok) return true;
    const updated = await this.prisma.client.authVerificationCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    if (updated.attempts >= MAX_CODE_ATTEMPTS) {
      await this.prisma.client.authVerificationCode.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
    }
    return false;
  }

  private hashCode(code: string) {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private async issueBuyerCode(userId: string, email: string, name: string, purpose: 'LOGIN' | 'VERIFY_EMAIL') {
    const code = crypto.randomInt(100000, 1_000_000).toString();
    await this.prisma.client.authVerificationCode.updateMany({
      where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() },
    });
    await this.prisma.client.authVerificationCode.create({
      data: { userId, purpose, codeHash: this.hashCode(code), expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });
    await this.emailService.sendBuyerCodeEmail({ recipientEmail: email, recipientName: name, code, purpose: purpose === 'LOGIN' ? 'login' : 'verify-email' });
  }

  // ========================================
  // TOKEN GENERATION
  // ========================================

  private generateToken(userId: string, email: string) {
    const payload = { sub: userId, email, isAdmin: false };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  // ========================================
  // PROFILE
  // ========================================

  async getSellerProfile(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: ACCOUNT_SELECT,
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return { user };
  }

  async updateBuyerProfile(
    userId: string,
    body: { name?: string; phone?: string | null; username?: string | null },
  ) {
    const data: { name?: string; phone?: string | null; username?: string } = {};
    if (body.username !== undefined && body.username !== null) {
      const username = normalizeUsername(body.username);
      const problem = usernameProblem(username);
      if (problem) throw new BadRequestException(problem);
      const taken = await this.prisma.client.user.findFirst({
        where: { username, NOT: { id: userId } },
        select: { id: true },
      });
      if (taken) throw new ConflictException('That username is already taken');
      data.username = username;
    }
    if (body.name !== undefined) {
      const name = String(body.name ?? '').trim();
      if (!name) throw new BadRequestException('Please enter your full name');
      if (name.length > 120) throw new BadRequestException('Name is too long');
      data.name = name;
    }
    if (body.phone !== undefined) {
      const phone = String(body.phone ?? '').replace(/\s+/g, '');
      if (phone && !/^(\+?254|0)[17]\d{8}$/.test(phone)) {
        throw new BadRequestException('Enter a valid Kenyan phone number, e.g. 0712 345 678');
      }
      data.phone = phone || null;
    }
    if (Object.keys(data).length) {
      try {
        await this.prisma.client.user.update({ where: { id: userId }, data });
      } catch (error: any) {
        // Two people claiming the same handle at the same moment.
        if (error?.code === 'P2002') throw new ConflictException('That username is already taken');
        throw error;
      }
    }
    return this.getSellerProfile(userId);
  }

  // ── Username ─────────────────────────────────────────────────────────────

  /** Live availability check for the username field, with suggestions. */
  async checkUsername(userId: string, raw: string) {
    const username = normalizeUsername(raw);
    const problem = usernameProblem(username);
    if (problem) return { username, available: false, reason: problem, suggestions: [] };
    const owner = await this.prisma.client.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!owner || owner.id === userId) {
      return { username, available: true, reason: null, suggestions: [] };
    }
    return {
      username,
      available: false,
      reason: 'That username is already taken',
      suggestions: await this.usernameSuggestions(username),
    };
  }

  private async usernameSuggestions(base: string): Promise<string[]> {
    const stem = base.replace(/[._]?\d+$/, '').slice(0, 24) || base.slice(0, 24);
    const candidates = new Set<string>();
    for (const sep of ['', '.', '_']) {
      candidates.add(`${stem}${sep}${crypto.randomInt(10, 100)}`);
    }
    candidates.add(`${stem}${crypto.randomInt(100, 1000)}`);
    candidates.add(`${stem}.ke`);
    const list = [...candidates].filter((c) => !usernameProblem(c));
    const taken = await this.prisma.client.user.findMany({
      where: { username: { in: list } },
      select: { username: true },
    });
    const takenSet = new Set(taken.map((t) => t.username));
    return list.filter((c) => !takenSet.has(c)).slice(0, 3);
  }

  /** The base handle if free, otherwise the base with a short number added. */
  private async availableUsername(base: string): Promise<string> {
    const free = async (u: string) =>
      !(await this.prisma.client.user.findUnique({ where: { username: u }, select: { id: true } }));
    if (await free(base)) return base;
    for (let i = 0; i < 8; i++) {
      const candidate = `${base.slice(0, 25)}${crypto.randomInt(10, 10_000)}`;
      if (await free(candidate)) return candidate;
    }
    return `${base.slice(0, 20)}${crypto.randomBytes(4).toString('hex')}`;
  }

  // ── Profile photo ────────────────────────────────────────────────────────

  async setAvatar(userId: string, file: { buffer: Buffer; mimetype: string; size: number } | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a photo to upload');
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)) {
      throw new BadRequestException('Use a JPG, PNG, WebP or HEIC photo');
    }
    const current = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (!current) throw new UnauthorizedException('User not found');

    const folder = `${process.env.CLOUDINARY_FOLDER ?? 'quza'}/avatars`;
    let uploaded: { url: string; publicId: string };
    try {
      uploaded = await uploadAvatarToCloudinary(file.buffer, folder);
    } catch {
      throw new BadRequestException('We couldn’t upload that photo. Please try another one.');
    }
    await this.prisma.client.user.update({ where: { id: userId }, data: { avatarUrl: uploaded.url } });
    await this.removeStoredAvatar(current.avatarUrl);
    return this.getSellerProfile(userId);
  }

  async removeAvatar(userId: string) {
    const current = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (!current) throw new UnauthorizedException('User not found');
    if (current.avatarUrl) {
      await this.prisma.client.user.update({ where: { id: userId }, data: { avatarUrl: null } });
      await this.removeStoredAvatar(current.avatarUrl);
    }
    return this.getSellerProfile(userId);
  }

  private async removeStoredAvatar(url: string | null) {
    const publicId = url ? cloudinaryPublicId(url) : null;
    if (publicId && publicId.includes('/avatars/')) await destroyCloudinaryImage(publicId);
  }

  // ── Email change (verified) ──────────────────────────────────────────────
  // The new address only replaces the old one after the buyer enters a code
  // sent to it, and the old address is told about the change — the same
  // pattern Google and Amazon use, so a stolen session can't silently take
  // over the account's recovery email.

  async requestEmailChange(userId: string, body: { newEmail: string; currentPassword: string }) {
    const newEmail = String(body.newEmail ?? '').trim().toLowerCase();
    const password = String(body.currentPassword ?? '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      throw new BadRequestException('Please enter a valid email address');
    }
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    if (!(await bcrypt.compare(password, user.password))) {
      throw new BadRequestException('Your current password is incorrect');
    }
    if (newEmail === user.email) throw new BadRequestException('That is already your email address');
    const taken = await this.prisma.client.user.findUnique({ where: { email: newEmail }, select: { id: true } });
    if (taken) throw new ConflictException('Another account already uses that email address');

    const recent = await this.prisma.client.authVerificationCode.findFirst({
      where: {
        userId,
        purpose: 'CHANGE_EMAIL',
        createdAt: { gt: new Date(Date.now() - EMAIL_CHANGE_RESEND_MS) },
      },
      select: { id: true },
    });
    if (recent) throw new BadRequestException('Please wait a minute before requesting another code');

    const code = crypto.randomInt(100000, 1_000_000).toString();
    await this.prisma.client.authVerificationCode.updateMany({
      where: { userId, purpose: 'CHANGE_EMAIL', usedAt: null },
      data: { usedAt: new Date() },
    });
    const row = await this.prisma.client.authVerificationCode.create({
      data: {
        userId,
        purpose: 'CHANGE_EMAIL',
        target: newEmail,
        codeHash: this.hashCode(code),
        expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
      },
    });
    try {
      await this.emailService.sendBuyerCodeEmail({
        recipientEmail: newEmail,
        recipientName: user.name,
        code,
        purpose: 'change-email',
      });
    } catch (error) {
      await this.prisma.client.authVerificationCode.delete({ where: { id: row.id } });
      throw error;
    }
    return { email: newEmail, expiresInSeconds: EMAIL_CHANGE_TTL_MS / 1000 };
  }

  async confirmEmailChange(userId: string, rawCode: string) {
    const code = String(rawCode ?? '').trim();
    const pending = await this.prisma.client.authVerificationCode.findFirst({
      where: { userId, purpose: 'CHANGE_EMAIL', usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending?.target || !(await this.codeMatches(pending, code))) {
      throw new BadRequestException('The verification code is invalid or expired');
    }
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    const newEmail = pending.target;
    try {
      await this.prisma.client.$transaction([
        this.prisma.client.authVerificationCode.update({ where: { id: pending.id }, data: { usedAt: new Date() } }),
        this.prisma.client.user.update({
          where: { id: userId },
          data: { email: newEmail, emailVerifiedAt: new Date() },
        }),
      ]);
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Another account already uses that email address');
      throw error;
    }
    // Security notice to the previous address; never blocks the change.
    this.emailService
      .sendEmailChangedNotice({ recipientEmail: user.email, recipientName: user.name, newEmail })
      .catch(() => undefined);
    return { ...this.generateToken(userId, newEmail), ...(await this.getSellerProfile(userId)) };
  }

  async changeBuyerPassword(userId: string, body: { currentPassword: string; newPassword: string }) {
    const current = String(body.currentPassword ?? '');
    const next = String(body.newPassword ?? '');
    if (next.length < 8) throw new BadRequestException('New password must be at least 8 characters');
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { password: true } });
    if (!user) throw new UnauthorizedException('User not found');
    if (!(await bcrypt.compare(current, user.password))) {
      throw new BadRequestException('Your current password is incorrect');
    }
    await this.prisma.client.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(next, 10) } });
    return { message: 'Password updated' };
  }

  async saveBuyerAddress(userId: string, body: any) {
    const required = ['recipientName', 'phone', 'addressLine', 'city', 'state', 'postalCode'];
    if (required.some((field) => !String(body[field] ?? '').trim())) {
      throw new BadRequestException('Please complete all delivery address fields');
    }
    const client = this.prisma.client;
    const owned = body.id
      ? await client.buyerAddress.findFirst({ where: { id: body.id, userId }, select: { id: true, isDefault: true } })
      : null;
    if (body.id && !owned) throw new ForbiddenException('Delivery address not found');
    if (!owned && (await client.buyerAddress.count({ where: { userId } })) >= MAX_BUYER_ADDRESSES) {
      throw new BadRequestException(
        `You can save up to ${MAX_BUYER_ADDRESSES} delivery addresses. Remove one to add another.`,
      );
    }

    const otherDefault = await client.buyerAddress.findFirst({
      where: { userId, isDefault: true, ...(owned ? { id: { not: owned.id } } : {}) },
      select: { id: true },
    });
    // The buyer always keeps exactly one default: honour an explicit request,
    // otherwise keep the current default, or make this one default if none exists.
    const isDefault = body.isDefault === true || (owned?.isDefault ?? false) || !otherDefault;

    const data = {
      label: String(body.label ?? 'Home').trim() || 'Home',
      recipientName: String(body.recipientName).trim(), phone: String(body.phone).trim(),
      addressLine: String(body.addressLine).trim(), city: String(body.city).trim(),
      state: String(body.state).trim(), postalCode: String(body.postalCode).trim(),
      isDefault,
    };

    const address = await client.$transaction(async (tx) => {
      if (isDefault) await tx.buyerAddress.updateMany({ where: { userId }, data: { isDefault: false } });
      return owned
        ? tx.buyerAddress.update({ where: { id: owned.id }, data })
        : tx.buyerAddress.create({ data: { userId, ...data } });
    });
    // Only overwrite the account's own name/phone when the caller asks for it —
    // an address may be for someone else (e.g. a gift or a relative).
    if (body.syncProfile === true) {
      await client.user.update({ where: { id: userId }, data: { name: data.recipientName, phone: data.phone } });
    }
    return { address };
  }

  async setDefaultBuyerAddress(userId: string, addressId: string) {
    const client = this.prisma.client;
    const owned = await client.buyerAddress.findFirst({ where: { id: addressId, userId }, select: { id: true } });
    if (!owned) throw new NotFoundException('Delivery address not found');
    await client.$transaction([
      client.buyerAddress.updateMany({ where: { userId }, data: { isDefault: false } }),
      client.buyerAddress.update({ where: { id: addressId }, data: { isDefault: true } }),
    ]);
    return this.listBuyerAddresses(userId);
  }

  async deleteBuyerAddress(userId: string, addressId: string) {
    const client = this.prisma.client;
    const owned = await client.buyerAddress.findFirst({ where: { id: addressId, userId }, select: { id: true, isDefault: true } });
    if (!owned) throw new NotFoundException('Delivery address not found');
    await client.$transaction(async (tx) => {
      await tx.buyerAddress.delete({ where: { id: addressId } });
      if (owned.isDefault) {
        // Promote the most recently used remaining address so a default always exists.
        const next = await tx.buyerAddress.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' }, select: { id: true } });
        if (next) await tx.buyerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    return this.listBuyerAddresses(userId);
  }

  private async listBuyerAddresses(userId: string) {
    const addresses = await this.prisma.client.buyerAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return { addresses };
  }

  async getAdminProfile(adminId: string) {
    const admin = await this.prisma.client.admin.findUnique({
      where: { id: adminId },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    const permissions = admin.role.permissions.map(
      (rp) => rp.permission.name,
    );

    return {
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role.name,
        roleId: admin.roleId,
        isActive: admin.isActive,
        lastLoginAt: admin.lastLoginAt,
      },
      permissions,
    };
  }
}
