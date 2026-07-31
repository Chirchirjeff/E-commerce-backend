// src/auth/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Roles decorator - Restricts access to specific roles
 * 
 * @example
 * ```typescript
 * @Roles('ADMIN')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * async adminOnlyEndpoint() { ... }
 * ```
 * 
 * @example
 * ```typescript
 * @Roles('ADMIN', 'SUPPORT')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * async multipleRolesEndpoint() { ... }
 * ```
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);