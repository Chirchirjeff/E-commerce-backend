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

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
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
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return { user };
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