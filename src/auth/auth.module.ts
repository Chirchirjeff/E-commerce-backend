// src/auth/auth.module.ts

import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    JwtModule.register({
      global: true, // Makes JwtService available everywhere across our app
      secret: process.env.JWT_SECRET || 'fallback_secret_key',
      signOptions: { expiresIn: '7d' }, // Token lasts 7 days
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService,],
})
export class AuthModule {}