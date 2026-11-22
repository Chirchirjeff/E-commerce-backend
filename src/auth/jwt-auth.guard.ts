import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { SKIP_GUARD_KEY, OPTIONAL_AUTH_KEY } from './decorators/skip-guard.decorator';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role?: string;
        permissions?: string[];
        isAdmin?: boolean;
      };
    }
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipGuard = this.reflector.getAllAndOverride<boolean>(SKIP_GUARD_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipGuard) return true;

    const optionalAuth = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      // Optional-auth routes allow unauthenticated access; request.user stays undefined
      if (optionalAuth) return true;
      throw new UnauthorizedException('Authentication token missing');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'your-secret-key',
      });
      request.user = {
        id: payload.sub,
        email: payload.email,
        isAdmin: payload.isAdmin || false,
        role: payload.role,
      };
    } catch {
      // Token present but invalid
      if (optionalAuth) return true; // still allow — treat as unauthenticated
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
