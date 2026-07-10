// src/auth/auth.service.ts

import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

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
    const existingUser = await this.prisma.client.user.findUnique({ where: { email } });
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

  async login(body: any) {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    if (!email || !password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Find user
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check password match
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.generateToken(user.id, user.email);
  }

  private generateToken(userId: string, email: string) {
    const payload = { sub: userId, email };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
