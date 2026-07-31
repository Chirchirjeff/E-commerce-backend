import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
// Remove JwtAuthGuard import - it's now global
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('users')
@UseGuards(PermissionsGuard) // Only use PermissionsGuard
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ========================================
  // ADMIN MANAGEMENT (Super Admin only)
  // ========================================

  @Get('admins')
  @RequirePermissions('can_manage_admins')
  async getAllAdmins() {
    return this.usersService.getAllAdmins();
  }

  @Get('admins/:id')
  @RequirePermissions('can_manage_admins')
  async getAdminById(@Param('id') id: string) {
    return this.usersService.getAdminById(id);
  }

  @Post('admins')
  @RequirePermissions('can_manage_admins')
  async createAdmin(
    @Body() body: { email: string; password: string; name: string; roleId: string },
  ) {
    if (!body.email || !body.password || !body.name || !body.roleId) {
      throw new BadRequestException('All fields are required');
    }
    return this.usersService.createAdmin(body);
  }

  @Put('admins/:id')
  @RequirePermissions('can_manage_admins')
  async updateAdmin(
    @Param('id') id: string,
    @Body() body: { name?: string; roleId?: string; isActive?: boolean },
  ) {
    return this.usersService.updateAdmin(id, body);
  }

  @Delete('admins/:id')
  @RequirePermissions('can_manage_admins')
  async deleteAdmin(@Param('id') id: string) {
    return this.usersService.deleteAdmin(id);
  }

  @Post('admins/:id/reset-password')
  @RequirePermissions('can_manage_admins')
  async resetPassword(
    @Param('id') id: string,
    @Body() body: { password: string },
  ) {
    if (!body.password) {
      throw new BadRequestException('Password is required');
    }
    return this.usersService.resetPassword(id, body.password);
  }

  // ========================================
  // ROLES MANAGEMENT (Super Admin only)
  // ========================================

  @Get('roles')
  @RequirePermissions('can_manage_roles')
  async getAllRoles() {
    return this.usersService.getAllRoles();
  }

  @Get('permissions')
  @RequirePermissions('can_manage_roles')
  async getAllPermissions() {
    return this.usersService.getAllPermissions();
  }

  @Post('roles')
  @RequirePermissions('can_manage_roles')
  async createRole(
    @Body() body: { name: string; description: string; permissionIds: string[] },
  ) {
    if (!body.name || !body.permissionIds) {
      throw new BadRequestException('Name and permissions are required');
    }
    return this.usersService.createRole(body);
  }

  @Put('roles/:id')
  @RequirePermissions('can_manage_roles')
  async updateRole(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; permissionIds?: string[] },
  ) {
    return this.usersService.updateRole(id, body);
  }

  @Delete('roles/:id')
  @RequirePermissions('can_manage_roles')
  async deleteRole(@Param('id') id: string) {
    return this.usersService.deleteRole(id);
  }
}