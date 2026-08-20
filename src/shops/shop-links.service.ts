import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateShopLinkDto } from './dto/create-shop-link.dto';
import { ShopLinkResponseDto, ShopLinkAnalyticsDto } from './dto/shop-link-response.dto';
import * as crypto from 'crypto';

@Injectable()
export class ShopLinksService {
  constructor(private prisma: PrismaService) {}

  private get client() {
    return this.prisma.client;
  }

  /**
   * Create a new unique link for a shop
   */
  async createShopLink(
    shopId: string,
    userId: string,
    createShopLinkDto: CreateShopLinkDto,
  ): Promise<ShopLinkResponseDto> {
    // Verify shop exists and user owns it
    const shop = await this.client.shop.findUnique({
      where: { id: shopId },
      select: { ownerId: true, verificationStatus: true },
    });

    if (!shop) {
      throw new NotFoundException(`Shop with ID ${shopId} not found`);
    }

    if (shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this shop');
    }

    // Check if shop is verified
    if (shop.verificationStatus !== 'ACTIVE') {
      throw new BadRequestException(
        'Shop must be verified and active to create share links',
      );
    }

    // Generate unique token using crypto randomUUID
    const token = crypto.randomUUID();

    // Create the link
    const shopLink = await this.client.shopLink.create({
      data: {
        shopId,
        token,
        title: createShopLinkDto.title,
        description: createShopLinkDto.description,
        source: createShopLinkDto.source,
      },
    });

    return this.formatShopLinkResponse(shopLink);
  }

  /**
   * Get all links for a shop
   */
  async getShopLinks(
    shopId: string,
    userId: string,
    isActive?: boolean,
  ): Promise<ShopLinkResponseDto[]> {
    // Verify shop ownership
    const shop = await this.client.shop.findUnique({
      where: { id: shopId },
      select: { ownerId: true },
    });

    if (!shop) {
      throw new NotFoundException(`Shop with ID ${shopId} not found`);
    }

    if (shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this shop');
    }

    const where: any = { shopId };
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const links = await this.client.shopLink.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { visits: true },
        },
      },
    });

    return links.map((link) => this.formatShopLinkResponse(link));
  }

  /**
   * Get a specific shop link by ID
   */
  async getShopLink(
    linkId: string,
    userId: string,
  ): Promise<ShopLinkResponseDto> {
    const link = await this.client.shopLink.findUnique({
      where: { id: linkId },
      include: {
        shop: { select: { ownerId: true } },
      },
    });

    if (!link) {
      throw new NotFoundException(`Shop link with ID ${linkId} not found`);
    }

    if (link.shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this shop link');
    }

    return this.formatShopLinkResponse(link);
  }

  /**
   * Update a shop link
   */
  async updateShopLink(
    linkId: string,
    userId: string,
    updateData: Partial<CreateShopLinkDto>,
  ): Promise<ShopLinkResponseDto> {
    const link = await this.client.shopLink.findUnique({
      where: { id: linkId },
      include: {
        shop: { select: { ownerId: true } },
      },
    });

    if (!link) {
      throw new NotFoundException(`Shop link with ID ${linkId} not found`);
    }

    if (link.shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this shop link');
    }

    const updated = await this.client.shopLink.update({
      where: { id: linkId },
      data: {
        title: updateData.title ?? link.title,
        description: updateData.description ?? link.description,
        source: updateData.source ?? link.source,
      },
    });

    return this.formatShopLinkResponse(updated);
  }

  /**
   * Toggle link active status
   */
  async toggleLinkStatus(
    linkId: string,
    userId: string,
  ): Promise<ShopLinkResponseDto> {
    const link = await this.client.shopLink.findUnique({
      where: { id: linkId },
      include: {
        shop: { select: { ownerId: true } },
      },
    });

    if (!link) {
      throw new NotFoundException(`Shop link with ID ${linkId} not found`);
    }

    if (link.shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this shop link');
    }

    const updated = await this.client.shopLink.update({
      where: { id: linkId },
      data: { isActive: !link.isActive },
    });

    return this.formatShopLinkResponse(updated);
  }

  /**
   * Delete a shop link
   */
  async deleteShopLink(linkId: string, userId: string): Promise<void> {
    const link = await this.client.shopLink.findUnique({
      where: { id: linkId },
      include: {
        shop: { select: { ownerId: true } },
      },
    });

    if (!link) {
      throw new NotFoundException(`Shop link with ID ${linkId} not found`);
    }

    if (link.shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this shop link');
    }

    await this.client.shopLink.delete({
      where: { id: linkId },
    });
  }

  /**
   * Get analytics for a shop link
   */
  async getLinkAnalytics(
    linkId: string,
    userId: string,
  ): Promise<ShopLinkAnalyticsDto> {
    const link = await this.client.shopLink.findUnique({
      where: { id: linkId },
      include: {
        shop: { select: { ownerId: true } },
        visits: true,
      },
    });

    if (!link) {
      throw new NotFoundException(`Shop link with ID ${linkId} not found`);
    }

    if (link.shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this shop link');
    }

    return this.formatAnalytics(link);
  }

  /**
   * Resolve a shop link by token (public endpoint)
   * Returns shop info and records a visit
   * 
   * HYBRID MODE: Tries token first, then falls back to slug resolution
   */
  async resolveLinkByToken(
    tokenOrSlug: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ shop: any; linkId?: string; resolvedVia: 'token' | 'slug' }> {
    let resolvedVia: 'token' | 'slug' = 'token';

    // Try resolving by token first
    const linkByToken = await this.client.shopLink.findUnique({
      where: { token: tokenOrSlug },
      include: {
        shop: {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            _count: {
              select: { orders: true, products: true, reviews: true },
            },
          },
        },
      },
    });

    // If token found and link is active, return it
    if (linkByToken && linkByToken.isActive) {
      // Record visit for token resolution
      this.recordLinkVisit(linkByToken.id, userAgent, ipAddress).catch((err) => {
        console.error('Error recording link visit:', err);
      });

      return {
        shop: linkByToken.shop,
        linkId: linkByToken.id,
        resolvedVia: 'token',
      };
    }

    // Token not found or inactive, try resolving by shop slug
    resolvedVia = 'slug';
    const shop = await this.client.shop.findUnique({
      where: { slug: tokenOrSlug },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: { orders: true, products: true, reviews: true },
        },
      },
    });

    if (!shop) {
      throw new NotFoundException(
        'Shop not found. Invalid token or slug.',
      );
    }

    // Check if shop is active (for slug resolution)
    if (shop.verificationStatus !== 'ACTIVE') {
      throw new NotFoundException('This shop is not currently active.');
    }

    // Record visit for slug resolution (without linkId)
    this.recordSlugVisit(shop.id, userAgent, ipAddress).catch((err) => {
      console.error('Error recording slug visit:', err);
    });

    return {
      shop,
      linkId: undefined,
      resolvedVia: 'slug',
    };
  }

  /**
   * Record a visit to a shop link
   */
  private async recordLinkVisit(
    linkId: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<void> {
    const { deviceType, browser } = this.parseUserAgent(userAgent);
    const ipHash = ipAddress ? this.hashIp(ipAddress) : null;

    // Update link click count
    await this.client.shopLink.update({
      where: { id: linkId },
      data: {
        clickCount: { increment: 1 },
        lastClickedAt: new Date(),
      },
    });

    // Record visit details
    await this.client.shopLinkVisit.create({
      data: {
        shopLinkId: linkId,
        userAgent,
        deviceType,
        browser,
        ipHash,
      },
    });
  }

  /**
   * Record a visit via slug (direct shop access)
   * NOTE: ShopSlugVisit table is optional and not currently created
   * This method is a placeholder for future implementation
   * For now, slug visits are not tracked separately
   */
  private async recordSlugVisit(
    shopId: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<void> {
    // TODO: Implement slug visit tracking in the future
    // This would require creating ShopSlugVisit table in Prisma
    // For now, this is a no-op to maintain the interface
    return Promise.resolve();
  }

  /**
   * Get all analytics for a shop's links
   */
  async getShopLinksAnalytics(
    shopId: string,
    userId: string,
  ): Promise<ShopLinkAnalyticsDto[]> {
    const shop = await this.client.shop.findUnique({
      where: { id: shopId },
      select: { ownerId: true },
    });

    if (!shop) {
      throw new NotFoundException(`Shop with ID ${shopId} not found`);
    }

    if (shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this shop');
    }

    const links = await this.client.shopLink.findMany({
      where: { shopId },
      include: {
        visits: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return links.map((link) => this.formatAnalytics(link));
  }

  /**
   * Helper: Format shop link response
   */
  private formatShopLinkResponse(link: any): ShopLinkResponseDto {
    return {
      id: link.id,
      shopId: link.shopId,
      token: link.token,
      title: link.title,
      description: link.description,
      source: link.source,
      clickCount: link.clickCount,
      lastClickedAt: link.lastClickedAt,
      isActive: link.isActive,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
    };
  }

  /**
   * Helper: Format analytics response
   */
  private formatAnalytics(link: any): ShopLinkAnalyticsDto {
    const visits = link.visits || [];

    // Calculate analytics
    const analytics = {
      totalClicks: link.clickCount,
      uniqueVisitors: new Set(visits.map((v: any) => v.ipHash)).size,
      topCountries: this.getTopCountries(visits),
      topDevices: this.getTopDevices(visits),
      topBrowsers: this.getTopBrowsers(visits),
      clicksByDay: this.getClicksByDay(visits),
    };

    return {
      id: link.id,
      token: link.token,
      title: link.title,
      description: link.description,
      source: link.source,
      clickCount: link.clickCount,
      lastClickedAt: link.lastClickedAt,
      isActive: link.isActive,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      analytics,
    };
  }

  /**
   * Helper: Parse user agent to extract device type and browser
   */
  private parseUserAgent(userAgent?: string): {
    deviceType?: string;
    browser?: string;
  } {
    if (!userAgent) {
      return {};
    }

    let deviceType: string | undefined;
    let browser: string | undefined;

    // Detect device type
    if (/mobile|android|iphone|ipod/i.test(userAgent)) {
      deviceType = 'mobile';
    } else if (/tablet|ipad/i.test(userAgent)) {
      deviceType = 'tablet';
    } else {
      deviceType = 'desktop';
    }

    // Detect browser
    if (/edge/i.test(userAgent)) {
      browser = 'Edge';
    } else if (/chrome/i.test(userAgent)) {
      browser = 'Chrome';
    } else if (/safari/i.test(userAgent)) {
      browser = 'Safari';
    } else if (/firefox/i.test(userAgent)) {
      browser = 'Firefox';
    } else if (/opera|opr/i.test(userAgent)) {
      browser = 'Opera';
    }

    return { deviceType, browser };
  }

  /**
   * Helper: Hash IP address for privacy
   */
  private hashIp(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex');
  }

  /**
   * Helper: Get top countries from visits
   */
  private getTopCountries(
    visits: any[],
  ): Array<{ country: string; visits: number }> {
    const countryMap = new Map<string, number>();

    visits.forEach((visit) => {
      if (visit.country) {
        countryMap.set(visit.country, (countryMap.get(visit.country) || 0) + 1);
      }
    });

    return Array.from(countryMap.entries())
      .map(([country, count]) => ({ country, visits: count }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 5);
  }

  /**
   * Helper: Get top devices from visits
   */
  private getTopDevices(
    visits: any[],
  ): Array<{ device: string; visits: number }> {
    const deviceMap = new Map<string, number>();

    visits.forEach((visit) => {
      if (visit.deviceType) {
        deviceMap.set(visit.deviceType, (deviceMap.get(visit.deviceType) || 0) + 1);
      }
    });

    return Array.from(deviceMap.entries())
      .map(([device, count]) => ({ device, visits: count }))
      .sort((a, b) => b.visits - a.visits);
  }

  /**
   * Helper: Get top browsers from visits
   */
  private getTopBrowsers(
    visits: any[],
  ): Array<{ browser: string; visits: number }> {
    const browserMap = new Map<string, number>();

    visits.forEach((visit) => {
      if (visit.browser) {
        browserMap.set(visit.browser, (browserMap.get(visit.browser) || 0) + 1);
      }
    });

    return Array.from(browserMap.entries())
      .map(([browser, count]) => ({ browser, visits: count }))
      .sort((a, b) => b.visits - a.visits);
  }

  /**
   * Helper: Get clicks by day (last 30 days)
   */
  private getClicksByDay(visits: any[]): Array<{ date: string; clicks: number }> {
    const dayMap = new Map<string, number>();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    visits.forEach((visit) => {
      if (visit.visitedAt >= thirtyDaysAgo) {
        const date = new Date(visit.visitedAt).toISOString().split('T')[0];
        dayMap.set(date, (dayMap.get(date) || 0) + 1);
      }
    });

    return Array.from(dayMap.entries())
      .map(([date, clicks]) => ({ date, clicks }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
