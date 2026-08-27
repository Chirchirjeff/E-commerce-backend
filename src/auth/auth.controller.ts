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

  @Post('buyer/register')
  @SkipGuard()
  async registerBuyer(@Body() body: { name: string; email: string; password: string; phone?: string }) {
    return this.authService.registerBuyer(body);
  }

  @Post('buyer/login')
  @SkipGuard()
  @HttpCode(HttpStatus.OK)
  async beginBuyerLogin(@Body() body: { email: string; password: string }) {
    return this.authService.beginBuyerLogin(body);
  }

  @Post('buyer/verify')
  @SkipGuard()
  @HttpCode(HttpStatus.OK)
  async verifyBuyerCode(@Body() body: { email: string; code: string; purpose: 'LOGIN' | 'VERIFY_EMAIL' }) {
    return this.authService.verifyBuyerCode(body);
  }

  @Post('buyer/password-reset/request')
  @SkipGuard()
  @HttpCode(HttpStatus.OK)
  async requestBuyerPasswordReset(@Body() body: { email: string }) {
    return this.authService.requestBuyerPasswordReset(body.email);
  }

  @Post('buyer/password-reset/confirm')
  @SkipGuard()
  @HttpCode(HttpStatus.OK)
  async confirmBuyerPasswordReset(@Body() body: { token: string; password: string }) {
    return this.authService.confirmBuyerPasswordReset(body.token, body.password);
  }

  /**
   * Get current seller profile — protected
   */
  @Get('me')
  async getSellerProfile(@Req() req: any) {
    return this.authService.getSellerProfile(req.user.id);
  }

  @Post('me/addresses')
  async saveBuyerAddress(@Req() req: any, @Body() body: any) {
    return this.authService.saveBuyerAddress(req.user.id, body);
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
