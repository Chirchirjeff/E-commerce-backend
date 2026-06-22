// src/current-shop.decorator.ts

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Custom parameter decorator to extract the verified shopId directly within your controller routes.
 * * Usage inside any controller method:
 * @Post()
 * create(@CurrentShopId() shopId: string) { ... }
 */
export const CurrentShopId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    // 1. Switch the execution context to HTTP to get access to the Express Request object
    const request = ctx.switchToHttp().getRequest();
    
    // 2. Return the shopId that our TenantMiddleware safely attached to the request lifecycle
    return request.shopId;
  },
);