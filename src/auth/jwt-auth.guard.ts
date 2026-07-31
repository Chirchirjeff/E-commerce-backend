import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { SKIP_GUARD_KEY } from './decorators/skip-guard.decorator';

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
    // Check if the route has SkipGuard decorator
    const skipGuard = this.reflector.getAllAndOverride<boolean>(SKIP_GUARD_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipGuard) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
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
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}