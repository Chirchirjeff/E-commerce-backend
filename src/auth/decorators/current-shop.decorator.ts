import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to inject the current user's shop
 * Note: This decorator only extracts userId from the request
 * The actual shop lookup is done in the controller/service
 * to avoid async issues with param decorators
 */
export const CurrentShop = createParamDecorator(
  (data: any, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
