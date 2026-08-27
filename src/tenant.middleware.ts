import { Injectable, NestMiddleware, NotFoundException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from './prisma.service';

declare global {
  namespace Express {
    interface Request {
      shopId?: string;
    }
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      const hostname = req.hostname;

      // Skip for localhost or IP addresses
      if (
        !hostname ||
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
      ) {
        this.logger.debug(`Skipping tenant resolution: ${hostname}`);
        return next();
      }

      // Skip for ngrok / tunnel domains — these are not tenant subdomains
      if (
        hostname.endsWith('.ngrok-free.app') ||
        hostname.endsWith('.ngrok-free.dev') ||
        hostname.endsWith('.ngrok.app') ||
        hostname.endsWith('.ngrok.io') ||
        hostname.endsWith('.loca.lt') ||
        hostname.endsWith('.serveo.net')
      ) {
        this.logger.debug(`Skipping tenant resolution for tunnel host: ${hostname}`);
        return next();
      }

      // Skip for M-Pesa callback path regardless of host (belt-and-suspenders)
      if (req.path.startsWith('/mpesa/')) {
        return next();
      }

      const parts = hostname.split('.');
      
      if (parts.length <= 1) {
        return next();
      }

      const subdomain = parts[0].toLowerCase();
      const reservedSubdomains = ['www', 'api', 'admin', 'app'];
      
      if (reservedSubdomains.includes(subdomain)) {
        this.logger.debug(`Reserved subdomain: ${subdomain}`);
        return next();
      }

      // Look up the shop
      const shop = await this.prisma.client.shop.findUnique({
        where: { slug: subdomain },
        select: { id: true },
      });

      if (!shop) {
        this.logger.warn(`Shop not found: ${subdomain}`);
        throw new NotFoundException(`Store "${subdomain}" not found`);
      }

      req.shopId = shop.id;
      this.logger.debug(`Tenant: ${subdomain} → ${shop.id}`);
      next();
    } catch (error) {
      if (error instanceof NotFoundException) {
        return next(error);
      }
      this.logger.error(`Middleware error: ${error.message}`);
      return next(error);
    }
  }
}