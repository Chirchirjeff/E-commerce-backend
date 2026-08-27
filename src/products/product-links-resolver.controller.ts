import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  Res,
  NotFoundException,
  UseGuards,
  Inject,
} from '@nestjs/common';
import type { Response } from 'express';
import { ProductLinksService } from './product-links.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SkipGuard } from '../auth/decorators/skip-guard.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

export interface CreateProductLinkDto {
  title?: string;
  description?: string;
  source?: string;
}

/**
 * Product Links Controller
 * Handles both public resolution and authenticated management of product links
 */
@Controller('product-links')
export class ProductLinksResolverController {
  constructor(private readonly productLinksService: ProductLinksService) {}

  /**
   * PROTECTED: Create a new product link
   * POST /product-links/:productId
   */
  @Post(':productId')
  @UseGuards(JwtAuthGuard)
  async createProductLink(
    @Param('productId') productId: string,
    @Body() createProductLinkDto: CreateProductLinkDto,
    @CurrentUser() user: any,
  ) {
    return this.productLinksService.createProductLink(
      productId,
      user.id,
      createProductLinkDto,
    );
  }

  /**
   * PROTECTED: Get all links for a product
   * GET /product-links/product/:productId
   */
  @Get('product/:productId')
  @UseGuards(JwtAuthGuard)
  async getProductLinks(
    @Param('productId') productId: string,
    @CurrentUser() user: any,
  ) {
    return this.productLinksService.getProductLinks(productId, user.id);
  }

  /**
   * PROTECTED: Get a specific product link
   * GET /product-links/link/:linkId
   */
  @Get('link/:linkId')
  @UseGuards(JwtAuthGuard)
  async getProductLink(
    @Param('linkId') linkId: string,
    @CurrentUser() user: any,
  ) {
    return this.productLinksService.getProductLink(linkId, user.id);
  }

  /**
   * PROTECTED: Update a product link
   * PATCH /product-links/link/:linkId
   */
  @Patch('link/:linkId')
  @UseGuards(JwtAuthGuard)
  async updateProductLink(
    @Param('linkId') linkId: string,
    @Body() updateData: Partial<CreateProductLinkDto>,
    @CurrentUser() user: any,
  ) {
    return this.productLinksService.updateProductLink(linkId, user.id, updateData);
  }

  /**
   * PROTECTED: Toggle link active status
   * PATCH /product-links/link/:linkId/toggle
   */
  @Patch('link/:linkId/toggle')
  @UseGuards(JwtAuthGuard)
  async toggleLinkStatus(
    @Param('linkId') linkId: string,
    @CurrentUser() user: any,
  ) {
    return this.productLinksService.toggleLinkStatus(linkId, user.id);
  }

  /**
   * PROTECTED: Delete a product link
   * DELETE /product-links/link/:linkId
   */
  @Delete('link/:linkId')
  @UseGuards(JwtAuthGuard)
  async deleteProductLink(
    @Param('linkId') linkId: string,
    @CurrentUser() user: any,
  ) {
    await this.productLinksService.deleteProductLink(linkId, user.id);
    return { success: true };
  }

  /**
   * PROTECTED: Get analytics for a product link
   * GET /product-links/link/:linkId/analytics
   */
  @Get('link/:linkId/analytics')
  @UseGuards(JwtAuthGuard)
  async getLinkAnalytics(
    @Param('linkId') linkId: string,
    @CurrentUser() user: any,
  ) {
    return this.productLinksService.getLinkAnalytics(linkId, user.id);
  }

  /**
   * PROTECTED: Get all analytics for a product
   * GET /product-links/product/:productId/analytics
   */
  @Get('product/:productId/analytics')
  @UseGuards(JwtAuthGuard)
  async getProductLinksAnalytics(
    @Param('productId') productId: string,
    @CurrentUser() user: any,
  ) {
    return this.productLinksService.getProductLinksAnalytics(productId, user.id);
  }

  /**
   * PUBLIC: Resolve a product link by token
   * GET /product-links/resolve/:token
   * 
   * Returns product data and records the visit
   */
  @Get('resolve/:token')
  @SkipGuard()
  async resolveLink(
    @Param('token') token: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress =
        req.headers['x-forwarded-for'] ||
        req.headers['cf-connecting-ip'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress;

      const { product, linkId } = await this.productLinksService.resolveLinkByToken(
        token,
        userAgent,
        ipAddress?.toString(),
      );

      return res.json({
        success: true,
        data: {
          product,
          linkId,
        },
      });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return res.status(404).json({
          success: false,
          message: error.message,
          error: 'LINK_NOT_FOUND',
        });
      }

      console.error('Error resolving product link:', error);
      return res.status(500).json({
        success: false,
        message: 'Error resolving product link',
        error: 'INTERNAL_SERVER_ERROR',
      });
    }
  }
}
