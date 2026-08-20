import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as crypto from 'crypto';

export interface CreateProductLinkDto {
  title?: string;
  description?: string;
  source?: string;
}

export interface ProductLinkResponseDto {
  id: string;
  productId: string;
  token: string;
  title?: string;
  description?: string;
  source?: string;
  clickCount: number;
  lastClickedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductLinkAnalyticsDto extends ProductLinkResponseDto {
  analytics: {
    totalClicks: number;
    uniqueVisitors: number;
    topCountries: Array<{ country: string; visits: number }>;
    topDevices: Array<{ device: string; visits: number }>;
    topBrowsers: Array<{ browser: string; visits: number }>;
    clicksByDay: Array<{ date: string; clicks: number }>;
  };
}

@Injectable()
export class ProductLinksService {
  constructor(private prisma: PrismaService) {}

  private get client() {
    return this.prisma.client;
  }

  /**
   * Create a new unique link for a product
   */
  async createProductLink(
    productId: string,
    userId: string,
    createProductLinkDto: CreateProductLinkDto,
  ): Promise<ProductLinkResponseDto> {
    // Verify product exists and user owns the shop
    const product = await this.client.product.findUnique({
      where: { id: productId },
      include: { shop: { select: { ownerId: true } } },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    if (product.shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this product');
    }

    // Generate unique token
    const token = crypto.randomUUID();

    // Create the link
    const productLink = await this.client.productLink.create({
      data: {
        productId,
        token,
        title: createProductLinkDto.title,
        description: createProductLinkDto.description,
        source: createProductLinkDto.source,
      },
    });

    return this.formatProductLinkResponse(productLink);
  }

  /**
   * Get all links for a product
   */
  async getProductLinks(
    productId: string,
    userId: string,
    isActive?: boolean,
  ): Promise<ProductLinkResponseDto[]> {
    // Verify product ownership
    const product = await this.client.product.findUnique({
      where: { id: productId },
      include: { shop: { select: { ownerId: true } } },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    if (product.shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this product');
    }

    const where: any = { productId };
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const links = await this.client.productLink.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return links.map((link) => this.formatProductLinkResponse(link));
  }

  /**
   * Get a specific product link by ID
   */
  async getProductLink(
    linkId: string,
    userId: string,
  ): Promise<ProductLinkResponseDto> {
    const link = await this.client.productLink.findUnique({
      where: { id: linkId },
      include: {
        product: { include: { shop: { select: { ownerId: true } } } },
      },
    });

    if (!link) {
      throw new NotFoundException(`Product link with ID ${linkId} not found`);
    }

    if (link.product.shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this product link');
    }

    return this.formatProductLinkResponse(link);
  }

  /**
   * Update a product link
   */
  async updateProductLink(
    linkId: string,
    userId: string,
    updateData: Partial<CreateProductLinkDto>,
  ): Promise<ProductLinkResponseDto> {
    const link = await this.client.productLink.findUnique({
      where: { id: linkId },
      include: {
        product: { include: { shop: { select: { ownerId: true } } } },
      },
    });

    if (!link) {
      throw new NotFoundException(`Product link with ID ${linkId} not found`);
    }

    if (link.product.shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this product link');
    }

    const updated = await this.client.productLink.update({
      where: { id: linkId },
      data: {
        title: updateData.title ?? link.title,
        description: updateData.description ?? link.description,
        source: updateData.source ?? link.source,
      },
    });

    return this.formatProductLinkResponse(updated);
  }

  /**
   * Toggle link active status
   */
  async toggleLinkStatus(
    linkId: string,
    userId: string,
  ): Promise<ProductLinkResponseDto> {
    const link = await this.client.productLink.findUnique({
      where: { id: linkId },
      include: {
        product: { include: { shop: { select: { ownerId: true } } } },
      },
    });

    if (!link) {
      throw new NotFoundException(`Product link with ID ${linkId} not found`);
    }

    if (link.product.shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this product link');
    }

    const updated = await this.client.productLink.update({
      where: { id: linkId },
      data: { isActive: !link.isActive },
    });

    return this.formatProductLinkResponse(updated);
  }

  /**
   * Delete a product link
   */
  async deleteProductLink(linkId: string, userId: string): Promise<void> {
    const link = await this.client.productLink.findUnique({
      where: { id: linkId },
      include: {
        product: { include: { shop: { select: { ownerId: true } } } },
      },
    });

    if (!link) {
      throw new NotFoundException(`Product link with ID ${linkId} not found`);
    }

    if (link.product.shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this product link');
    }

    await this.client.productLink.delete({
      where: { id: linkId },
    });
  }

  /**
   * Get analytics for a product link
   */
  async getLinkAnalytics(
    linkId: string,
    userId: string,
  ): Promise<ProductLinkAnalyticsDto> {
    const link = await this.client.productLink.findUnique({
      where: { id: linkId },
      include: {
        product: { include: { shop: { select: { ownerId: true } } } },
        visits: true,
      },
    });

    if (!link) {
      throw new NotFoundException(`Product link with ID ${linkId} not found`);
    }

    if (link.product.shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this product link');
    }

    return this.formatAnalytics(link);
  }

  /**
   * Get all analytics for a product's links
   */
  async getProductLinksAnalytics(
    productId: string,
    userId: string,
  ): Promise<ProductLinkAnalyticsDto[]> {
    const product = await this.client.product.findUnique({
      where: { id: productId },
      include: { shop: { select: { ownerId: true } } },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    if (product.shop.ownerId !== userId) {
      throw new ForbiddenException('You do not own this product');
    }

    const links = await this.client.productLink.findMany({
      where: { productId },
      include: { visits: true },
      orderBy: { createdAt: 'desc' },
    });

    return links.map((link) => this.formatAnalytics(link));
  }

  /**
   * Resolve a product link by token
   * Returns product info and records a visit
   */
  async resolveLinkByToken(
    token: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ product: any; linkId: string }> {
    const link = await this.client.productLink.findUnique({
      where: { token },
      include: {
        product: {
          include: {
            shop: true,
            marketplaceCategory: true,
          },
        },
      },
    });

    if (!link || !link.isActive) {
      throw new NotFoundException('Product link not found or is inactive');
    }

    // Record visit
    this.recordLinkVisit(link.id, userAgent, ipAddress).catch((err) => {
      console.error('Error recording product link visit:', err);
    });

    return {
      product: link.product,
      linkId: link.id,
    };
  }

  /**
   * Record a visit to a product link
   */
  private async recordLinkVisit(
    linkId: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<void> {
    const { deviceType, browser } = this.parseUserAgent(userAgent);
    const ipHash = ipAddress ? this.hashIp(ipAddress) : null;

    // Update link click count
    await this.client.productLink.update({
      where: { id: linkId },
      data: {
        clickCount: { increment: 1 },
        lastClickedAt: new Date(),
      },
    });

    // Record visit details
    await this.client.productLinkVisit.create({
      data: {
        productLinkId: linkId,
        userAgent,
        deviceType,
        browser,
        ipHash,
      },
    });
  }

  /**
   * Helper: Format product link response
   */
  private formatProductLinkResponse(link: any): ProductLinkResponseDto {
    return {
      id: link.id,
      productId: link.productId,
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
  private formatAnalytics(link: any): ProductLinkAnalyticsDto {
    const visits = link.visits || [];

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
      productId: link.productId,
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

    if (/mobile|android|iphone|ipod/i.test(userAgent)) {
      deviceType = 'mobile';
    } else if (/tablet|ipad/i.test(userAgent)) {
      deviceType = 'tablet';
    } else {
      deviceType = 'desktop';
    }

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
