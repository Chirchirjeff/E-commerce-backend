import { Controller, Get, Param, Req, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { ShopLinksService } from './shop-links.service';
import { SkipGuard } from '../auth/decorators/skip-guard.decorator';

/**
 * Public resolver controller for shop links
 * These endpoints are NOT protected by authentication guards
 * They allow anyone to access shop links via token
 */
@Controller('shop-links')
export class ShopLinksResolverController {
  constructor(private readonly shopLinksService: ShopLinksService) {}

  /**
   * Resolve a shop link by token or slug (hybrid mode)
   * GET /shop-links/resolve/:tokenOrSlug
   * 
   * Tries token first, falls back to slug resolution
   * Returns shop data that can be used by the frontend to display the shop
   * Also records the visit for analytics
   */
  @Get('resolve/:tokenOrSlug')
  @SkipGuard()
  async resolveLink(
    @Param('tokenOrSlug') tokenOrSlug: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      // Extract user agent and IP from request
      const userAgent = req.headers['user-agent'];
      const ipAddress =
        req.headers['x-forwarded-for'] ||
        req.headers['cf-connecting-ip'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress;

      // Resolve the link (hybrid: token first, then slug)
      const { shop, linkId, resolvedVia } = await this.shopLinksService.resolveLinkByToken(
        tokenOrSlug,
        userAgent,
        ipAddress?.toString(),
      );

      // Return shop data with resolution info
      return res.json({
        success: true,
        data: {
          shop,
          linkId,
          resolvedVia,
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

      console.error('Error resolving shop link:', error);
      return res.status(500).json({
        success: false,
        message: 'Error resolving shop link',
        error: 'INTERNAL_SERVER_ERROR',
      });
    }
  }

  /**
   * Get shop by token or slug (hybrid mode - returns full shop data)
   * GET /shop-links/:tokenOrSlug
   * 
   * Public endpoint - no authentication required
   * Tries token first, falls back to slug
   */
  @Get(':tokenOrSlug')
  @SkipGuard()
  async getShopByToken(@Param('tokenOrSlug') tokenOrSlug: string, @Req() req: any) {
    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress =
        req.headers['x-forwarded-for'] ||
        req.headers['cf-connecting-ip'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress;

      const { shop, linkId, resolvedVia } = await this.shopLinksService.resolveLinkByToken(
        tokenOrSlug,
        userAgent,
        ipAddress?.toString(),
      );

      return {
        success: true,
        data: {
          shop,
          linkId,
          resolvedVia,
        },
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw error;
    }
  }
}
