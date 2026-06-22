// src/auth/tenant.guard.ts

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TenantGuard implements CanActivate {
  // Use Prisma to run backend validation checks
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const shopId = request.shopId;

    // If a route doesn't go through a subdomain storefront context, pass it through
    if (!shopId) {
      return true;
    }

    // Query database to ensure current user actually owns the incoming shop context
    const shop = await this.prisma.client.shop.findUnique({
      where: { id: shopId },
      select: { ownerId: true },
    });

    if (!shop || shop.ownerId !== user.id) {
      throw new ForbiddenException('Access denied: You do not own this store management layer.');
    }

    return true;
  }
}