import { SetMetadata } from '@nestjs/common';

export const SKIP_GUARD_KEY = 'skipGuard';
export const SkipGuard = () => SetMetadata(SKIP_GUARD_KEY, true);

/**
 * Mark a route as allowing an optional JWT token.
 * The request proceeds whether or not a token is present.
 * When a valid token IS provided, request.user is populated as normal.
 */
export const OPTIONAL_AUTH_KEY = 'optionalAuth';
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);
