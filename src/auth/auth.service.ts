import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { EmailService } from '../email/email.service';

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
      data: { name, email, phone, password: await bcrypt.hash(password, 10) },
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
    if (!verification || !crypto.timingSafeEqual(Buffer.from(verification.codeHash), Buffer.from(this.hashCode(code)))) {
      throw new UnauthorizedException('The verification code is invalid or expired');
    }
    await this.prisma.client.$transaction([
      this.prisma.client.authVerificationCode.update({ where: { id: verification.id }, data: { usedAt: new Date() } }),
      this.prisma.client.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } }),
    ]);
    return this.generateToken(user.id, user.email);
  }

  /**
   * Sends a one-time password-reset link. The response intentionally does not
   * reveal whether the email belongs to a buyer account.
   */
  async requestBuyerPasswordReset(rawEmail: string) {
    const email = String(rawEmail ?? '').trim().toLowerCase();
    const confirmation = {
      message: 'If an account exists for this email address, we sent a password-reset link.',
    };

    if (!email || !email.includes('@')) return confirmation;

    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user) return confirmation;

    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.client.authVerificationCode.updateMany({
      where: { userId: user.id, purpose: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.prisma.client.authVerificationCode.create({
      data: {
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        codeHash: this.hashCode(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const storefrontUrl = (process.env.STOREFRONT_URL || 'http://localhost:3000').replace(/\/$/, '');
    await this.emailService.sendBuyerPasswordResetEmail({
      recipientEmail: user.email,
      recipientName: user.name,
      resetUrl: `${storefrontUrl}/reset-password?token=${encodeURIComponent(token)}`,
    });
    return confirmation;
  }

  async confirmBuyerPasswordReset(rawToken: string, rawPassword: string) {
    const token = String(rawToken ?? '').trim();
    const password = String(rawPassword ?? '');
    if (!token || password.length < 8) {
      throw new BadRequestException('Use a valid reset link and a password of at least 8 characters.');
    }

    const reset = await this.prisma.client.authVerificationCode.findFirst({
      where: {
        purpose: 'PASSWORD_RESET',
        codeHash: this.hashCode(token),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!reset) throw new BadRequestException('This password-reset link is invalid or has expired.');

    await this.prisma.client.$transaction([
      this.prisma.client.user.update({
        where: { id: reset.userId },
        data: { password: await bcrypt.hash(password, 10) },
      }),
      this.prisma.client.authVerificationCode.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { message: 'Your password has been changed. You can now sign in.' };
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
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        emailVerifiedAt: true,
        addresses: { orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] },
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return { user };
  }

  async saveBuyerAddress(userId: string, body: any) {
    const required = ['recipientName', 'phone', 'addressLine', 'city', 'state', 'postalCode'];
    if (required.some((field) => !String(body[field] ?? '').trim())) {
      throw new BadRequestException('Please complete all delivery address fields');
    }
    const existing = await this.prisma.client.buyerAddress.count({ where: { userId } });
    if (body.isDefault || existing === 0) {
      await this.prisma.client.buyerAddress.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    const data = {
      label: String(body.label ?? 'Home').trim() || 'Home',
      recipientName: String(body.recipientName).trim(), phone: String(body.phone).trim(),
      addressLine: String(body.addressLine).trim(), city: String(body.city).trim(),
      state: String(body.state).trim(), postalCode: String(body.postalCode).trim(),
      isDefault: body.isDefault || existing === 0,
    };
    if (body.id) {
      const ownedAddress = await this.prisma.client.buyerAddress.findFirst({ where: { id: body.id, userId }, select: { id: true } });
      if (!ownedAddress) throw new ForbiddenException('Delivery address not found');
    }
    const address = body.id
      ? await this.prisma.client.buyerAddress.update({ where: { id: body.id }, data })
      : await this.prisma.client.buyerAddress.create({ data: { userId, ...data } });
    await this.prisma.client.user.update({ where: { id: userId }, data: { name: data.recipientName, phone: data.phone } });
    return { address };
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
