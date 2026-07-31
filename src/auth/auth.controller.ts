// src/auth/auth.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SkipGuard } from './decorators/skip-guard.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Admin login — public, no token required
   */
  @Post('admin/login')
  @SkipGuard()
  @HttpCode(HttpStatus.OK)
  async adminLogin(@Body() body: { email: string; password: string }) {
    return this.authService.adminLogin(body.email, body.password);
  }

  /**
   * Seller registration — public, no token required
   */
  @Post('register')
  @SkipGuard()
  async register(@Body() body: any) {
    return this.authService.register(body);
  }

  /**
   * Seller login — public, no token required
   */
  @Post('login')
  @SkipGuard()
  @HttpCode(HttpStatus.OK)
  async sellerLogin(@Body() body: { email: string; password: string }) {
    return this.authService.sellerLogin(body.email, body.password);
  }

  /**
   * Get current seller profile — protected
   */
  @Get('me')
  async getSellerProfile(@Req() req: any) {
    return this.authService.getSellerProfile(req.user.id);
  }

  /**
   * Get current admin profile — protected
   */
  @Get('admin/me')
  @UseGuards(JwtAuthGuard)
  async getAdminProfile(@Req() req: any) {
    return this.authService.getAdminProfile(req.user.sub);
  }
}
