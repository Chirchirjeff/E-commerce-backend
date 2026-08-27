import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // ========================================
  // ADMIN MANAGEMENT (Super Admin only)
  // ========================================

  async createAdmin(data: {
    email: string;
    password: string;
    name: string;
    roleId: string;
  }) {
    const normalizedEmail = data.email.trim().toLowerCase();

    // Check if admin already exists
    const existing = await this.prisma.client.admin.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Admin with this email already exists');
    }

    // Check if role exists
    const role = await this.prisma.client.role.findUnique({
      where: { id: data.roleId },
    });
    if (!role) {
      throw new BadRequestException('Invalid role selected');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create admin
    const admin = await this.prisma.client.admin.create({
      data: {
        email: normalizedEmail,
        name: data.name,
        password: hashedPassword,
        roleId: data.roleId,
        isActive: true,
      },
      include: {
        role: true,
      },
    });

    // Remove password from response
    const { password, ...result } = admin;
    return result;
  }

  async getAllAdmins() {
    const admins = await this.prisma.client.admin.findMany({
      include: {
        role: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Remove passwords
    return admins.map(({ password, ...admin }) => admin);
  }

  async getAdminById(id: string) {
    const admin = await this.prisma.client.admin.findUnique({
      where: { id },
      include: {
        role: true,
      },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    const { password, ...result } = admin;
    return result;
  }

  async updateAdmin(id: string, data: { name?: string; roleId?: string; isActive?: boolean }) {
    const admin = await this.prisma.client.admin.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    // Check if role exists if being updated
    if (data.roleId) {
      const role = await this.prisma.client.role.findUnique({
        where: { id: data.roleId },
      });
      if (!role) {
        throw new BadRequestException('Invalid role selected');
      }
    }

    const updated = await this.prisma.client.admin.update({
      where: { id },
      data,
      include: {
        role: true,
      },
    });

    const { password, ...result } = updated;
    return result;
  }

  async deleteAdmin(id: string) {
    const admin = await this.prisma.client.admin.findUnique({
      where: { id },
      include: {
        role: true,
      },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    // Prevent deleting Super Admin
    if (admin.role?.name === 'Super Admin') {
      throw new ForbiddenException('Cannot delete the Super Admin account');
    }

    await this.prisma.client.admin.delete({
      where: { id },
    });

    return { message: 'Admin deleted successfully' };
  }

  async resetPassword(id: string, newPassword: string) {
    const admin = await this.prisma.client.admin.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.client.admin.update({
      where: { id },
      data: { password: hashedPassword },
    });

    return { message: 'Password reset successfully' };
  }

  // ========================================
  // ROLES MANAGEMENT (Super Admin only)
  // ========================================

  async getAllRoles() {
    const roles = await this.prisma.client.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: { admins: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return roles.map((role) => ({
      ...role,
      permissions: role.permissions.map((rp) => rp.permission),
    }));
  }

  async getAllPermissions() {
    console.log('🔍 getAllPermissions called');
    const permissions = await this.prisma.client.permission.findMany({
      orderBy: {
        category: 'asc',
      },
    });
    console.log(`📋 Found ${permissions.length} permissions in database`);
    if (permissions.length === 0) {
      console.log('⚠️ WARNING: No permissions found in database!');
    } else {
      console.log('✅ Permissions:', permissions.map(p => p.name));
    }
    return permissions;
  }

  async createRole(data: { name: string; description: string; permissionIds: string[] }) {
    const permissionIds = [...new Set(data.permissionIds)];
    if (permissionIds.length === 0) {
      throw new BadRequestException('Select at least one permission');
    }

    const existing = await this.prisma.client.role.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new ConflictException('Role with this name already exists');
    }

    const permissionCount = await this.prisma.client.permission.count({
      where: { id: { in: permissionIds } },
    });
    if (permissionCount !== permissionIds.length) {
      throw new BadRequestException('One or more selected permissions are invalid');
    }

    const role = await this.prisma.client.role.create({
      data: {
        name: data.name,
        description: data.description,
        isSystem: false,
        permissions: {
          create: permissionIds.map((permissionId) => ({
            permissionId,
          })),
        },
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return {
      ...role,
      permissions: role.permissions.map((rp) => rp.permission),
    };
  }

  async updateRole(id: string, data: { name?: string; description?: string; permissionIds?: string[] }) {
    const role = await this.prisma.client.role.findUnique({
      where: { id },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // If permissions are being updated, replace them
    if (data.permissionIds !== undefined) {
      const permissionIds = [...new Set(data.permissionIds)];
      if (permissionIds.length === 0) {
        throw new BadRequestException('Select at least one permission');
      }

      const permissionCount = await this.prisma.client.permission.count({
        where: { id: { in: permissionIds } },
      });
      if (permissionCount !== permissionIds.length) {
        throw new BadRequestException('One or more selected permissions are invalid');
      }

      // Delete existing permissions
      await this.prisma.client.rolePermission.deleteMany({
        where: { roleId: id },
      });

      // Create new permissions
      await this.prisma.client.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: id,
          permissionId,
        })),
      });
    }

    const updated = await this.prisma.client.role.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return {
      ...updated,
      permissions: updated.permissions.map((rp) => rp.permission),
    };
  }

  async deleteRole(id: string) {
    const role = await this.prisma.client.role.findUnique({
      where: { id },
      include: {
        admins: true,
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (role.name === 'Super Admin') {
      throw new ForbiddenException('The Super Admin role cannot be deleted');
    }

    // Check if any admins are using this role
    if (role.admins.length > 0) {
      throw new ForbiddenException(
        `Cannot delete role because ${role.admins.length} admin(s) are currently assigned to it`
      );
    }

    await this.prisma.client.role.delete({
      where: { id },
    });

    return { message: 'Role deleted successfully' };
  }
}
