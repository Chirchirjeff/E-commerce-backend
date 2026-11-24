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
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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

  // ── Password reset by emailed code (buyers and sellers) ─────────────────
  // The buyer/* paths are kept for app versions already in people's hands.

  @Post(['password-reset/request', 'buyer/password-reset/request'])
  @SkipGuard()
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(@Body() body: { email: string }) {
    return this.authService.requestPasswordReset(body?.email);
  }

  @Post('password-reset/verify')
  @SkipGuard()
  @HttpCode(HttpStatus.OK)
  async verifyPasswordResetCode(@Body() body: { email: string; code: string }) {
    return this.authService.verifyPasswordResetCode(body?.email, body?.code);
  }

  @Post(['password-reset/confirm', 'buyer/password-reset/confirm'])
  @SkipGuard()
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(
    @Body() body: { email?: string; code?: string; token?: string; password: string },
  ) {
    return this.authService.confirmPasswordReset(body ?? ({} as any));
  }

  /**
   * Get current seller profile — protected
   */
  @Get('me')
  async getSellerProfile(@Req() req: any) {
    return this.authService.getSellerProfile(req.user.id);
  }

  /** Buyer edits their own name, username and phone. */
  @Patch('me')
  async updateBuyerProfile(
    @Req() req: any,
    @Body() body: { name?: string; phone?: string | null; username?: string | null },
  ) {
    return this.authService.updateBuyerProfile(req.user.id, body);
  }

  /** GET /auth/me/username-check?username=jane.doe — live availability. */
  @Get('me/username-check')
  async checkUsername(@Req() req: any, @Query('username') username: string) {
    return this.authService.checkUsername(req.user.id, username);
  }

  /** POST /auth/me/avatar (multipart, field "file") — set the profile photo. */
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Use a JPG, PNG, WebP or HEIC photo') as any, false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadAvatar(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    return this.authService.setAvatar(req.user.id, file);
  }

  @Delete('me/avatar')
  async removeAvatar(@Req() req: any) {
    return this.authService.removeAvatar(req.user.id);
  }

  /** Step 1 of an email change: code goes to the new address. */
  @Post('me/email/request')
  @HttpCode(HttpStatus.OK)
  async requestEmailChange(@Req() req: any, @Body() body: { newEmail: string; currentPassword: string }) {
    return this.authService.requestEmailChange(req.user.id, body);
  }

  /** Step 2: confirm the code; returns a fresh token and the updated account. */
  @Post('me/email/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmEmailChange(@Req() req: any, @Body() body: { code: string }) {
    return this.authService.confirmEmailChange(req.user.id, body?.code);
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
