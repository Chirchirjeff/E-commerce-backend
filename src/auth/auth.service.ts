// src/auth/auth.service.ts

import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
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
    const { email, password, name } = body;

    // Check if user already exists
    const existingUser = await this.prisma.client.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    // Hash the password securely
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save user to database
    const user = await this.prisma.client.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
      },
    });

    return this.generateToken(user.id, user.email);
  }

  async login(body: any) {
    const { email, password } = body;

    // Find user
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check password match
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
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