// src/tenant.middleware.ts

import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from './prisma.service';

// Dynamically extend Express Request type definitions to carry our custom shopId context variable
declare global {
  namespace Express {
    interface Request {
      shopId?: string;
    }
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const hostname = req.hostname; // e.g., "nike.lvh.me" or "api.platform.com"

    // 1. Split host parts to isolate subdomains
    const parts = hostname.split('.');
    
    // If running locally on localhost without subdomains, or directly hitting the main domain
    if (parts.length <= 1 || hostname === 'localhost') {
      return next(); 
    }

    const subdomain = parts[0].toLowerCase();

    // 2. Define platform-wide bypass keywords
    const reservedSubdomains = ['www', 'api', 'admin', 'app'];
    if (reservedSubdomains.includes(subdomain)) {
      return next(); // Bypasses shop extraction so global flows (like creating a shop) can run
    }

    // 3. Look up the incoming subdomain slug inside PostgreSQL
    const shop = await this.prisma.client.shop.findUnique({
      where: { slug: subdomain },
      select: { id: true },
    });

    if (!shop) {
      throw new NotFoundException(`The storefront store platform at "${subdomain}" does not exist.`);
    }

    // 4. Stash the verified database Shop ID directly onto the request lifecycle pipeline
    req.shopId = shop.id;

    next();
  }
}