// src/auth/auth.controller.ts
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
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

  /** Buyer edits their own account name / phone. */
  @Patch('me')
  async updateBuyerProfile(@Req() req: any, @Body() body: { name?: string; phone?: string | null }) {
    return this.authService.updateBuyerProfile(req.user.id, body);
  }

  /** Buyer changes their password while signed in. */
  @Post('me/password')
  @HttpCode(HttpStatus.OK)
  async changeBuyerPassword(@Req() req: any, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.authService.changeBuyerPassword(req.user.id, body);
  }

  @Post('me/addresses')
  async saveBuyerAddress(@Req() req: any, @Body() body: any) {
    return this.authService.saveBuyerAddress(req.user.id, body);
  }

  @Patch('me/addresses/:id/default')
  async setDefaultBuyerAddress(@Req() req: any, @Param('id') id: string) {
    return this.authService.setDefaultBuyerAddress(req.user.id, id);
  }

  @Delete('me/addresses/:id')
  async deleteBuyerAddress(@Req() req: any, @Param('id') id: string) {
    return this.authService.deleteBuyerAddress(req.user.id, id);
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
