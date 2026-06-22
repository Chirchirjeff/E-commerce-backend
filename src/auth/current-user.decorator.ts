// src/auth/current-user.decorator.ts

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Accessor shortcut for extracting the authenticated user properties directly from JWT payloads.
 * Usage: @CurrentUser() user: { id: string, email: string }
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);