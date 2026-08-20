import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma.service';
import { SKIP_GUARD_KEY } from '../decorators/skip-guard.decorator';

// Seller-side permissions are validated by shop ownership in the service layer.
// These are the permissions sellers are always granted when they have a verified
// shop — no admin role lookup needed.
const SELLER_PERMISSIONS = new Set([
  'can_manage_products',
  'can_manage_categories',
  'can_view_orders',
  'can_manage_orders',
]);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if the route is marked to skip guard
    const skipGuard = this.reflector.get<boolean>(
      SKIP_GUARD_KEY,
      context.getHandler(),
    );

    if (skipGuard) {
      return true;
    }

    const requiredPermissions = this.reflector.get<string[]>(
      'permissions',
      context.getHandler(),
    );

    // No permissions required — allow any authenticated user
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.id) {
      throw new UnauthorizedException('Authentication required');
    }

    // ── Seller path ──────────────────────────────────────────────────────────
    // Sellers have isAdmin === false in their JWT. Their permissions are
    // governed by shop ownership (enforced in the service layer), so we grant
    // all seller-level permissions here without an admin table lookup.
    if (!user.isAdmin) {
      const allGranted = requiredPermissions.every((p) =>
        SELLER_PERMISSIONS.has(p),
      );

      if (!allGranted) {
        throw new ForbiddenException(
          `You don't have permission to access this resource.`,
        );
      }

      // Attach the seller's shopId to request.user so controllers / services
      // can use it without an extra DB call.
      if (!user.shopId) {
        const shop = await this.prisma.client.shop.findFirst({
          where: { ownerId: user.id },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (shop) {
          request.user.shopId = shop.id;
        }
      }

      return true;
    }

    // ── Admin path ───────────────────────────────────────────────────────────
    const admin = await this.prisma.client.admin.findUnique({
      where: { id: user.id },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    if (!admin.isActive) {
      throw new ForbiddenException('Your account has been deactivated');
    }

    const userPermissions = admin.role.permissions.map(
      (rp) => rp.permission.name,
    );

    const hasAllPermissions = requiredPermissions.every((p) =>
      userPermissions.includes(p),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        `You don't have permission to access this resource. Required: ${requiredPermissions.join(', ')}`,
      );
    }

    request.user.permissions = userPermissions;
    request.user.role = admin.role.name;

    return true;
  }
}
