import { PrismaClient, Role, Permission } from '@prisma/client';

const prisma = new PrismaClient();

// Define all permissions with their categories
const PERMISSIONS = {
  // Dashboard
  VIEW_DASHBOARD: { name: 'can_view_dashboard', category: 'Dashboard' },
  VIEW_ALL: { name: 'can_view_all', category: 'Dashboard' },

  // KYC Verification
  VERIFY_CLIENTS: { name: 'can_verify_clients', category: 'KYC' },
  VERIFY_VENDORS: { name: 'can_verify_vendors', category: 'KYC' },
  APPROVE_SELLERS: { name: 'can_approve_sellers', category: 'KYC' },
  OVERRIDE_REJECTION: { name: 'can_override_rejection', category: 'KYC' },

  // Admin Management
  MANAGE_ROLES: { name: 'can_manage_roles', category: 'Admin' },
  MANAGE_ADMINS: { name: 'can_manage_admins', category: 'Admin' },

  // Support
  VIEW_PROFILES: { name: 'can_view_profiles', category: 'Support' },
  REPLY_TICKETS: { name: 'can_reply_tickets', category: 'Support' },

  // Reports
  VIEW_REPORTS: { name: 'can_view_reports', category: 'Reports' },
  EXPORT_DATA: { name: 'can_export_data', category: 'Reports' },

  // Settings
  MANAGE_SETTINGS: { name: 'can_manage_settings', category: 'Settings' },

  // Orders
  VIEW_ORDERS: { name: 'can_view_orders', category: 'Orders' },
  MANAGE_ORDERS: { name: 'can_manage_orders', category: 'Orders' },

  // Products
  MANAGE_PRODUCTS: { name: 'can_manage_products', category: 'Products' },

  // Shops
  MANAGE_SHOPS: { name: 'can_manage_shops', category: 'Shops' },

  // Categories
  MANAGE_CATEGORIES: { name: 'can_manage_categories', category: 'Categories' },
};

// Define roles with their permissions
const ROLES = [
  {
    name: 'Super Admin',
    description: 'Full system access. Can manage admins, roles, and all settings.',
    isSystem: true,
    permissions: [
      'VIEW_DASHBOARD',
      'VIEW_ALL',
      'VERIFY_CLIENTS',
      'VERIFY_VENDORS',
      'APPROVE_SELLERS',
      'OVERRIDE_REJECTION',
      'MANAGE_ROLES',
      'MANAGE_ADMINS',
      'VIEW_PROFILES',
      'REPLY_TICKETS',
      'VIEW_REPORTS',
      'EXPORT_DATA',
      'MANAGE_SETTINGS',
      'VIEW_ORDERS',
      'MANAGE_ORDERS',
      'MANAGE_PRODUCTS',
      'MANAGE_SHOPS',
      'MANAGE_CATEGORIES',
    ],
  },
  {
    name: 'Compliance HOD',
    description: 'Head of Compliance. Approves high-risk sellers and handles escalations.',
    isSystem: true,
    permissions: [
      'VIEW_DASHBOARD',
      'VIEW_ALL',
      'APPROVE_SELLERS',
      'OVERRIDE_REJECTION',
      'VIEW_PROFILES',
      'VIEW_REPORTS',
    ],
  },
  {
    name: 'KYC Officer',
    description: 'Frontline verification. Checks IDs and documents for clients and vendors.',
    isSystem: true,
    permissions: [
      'VERIFY_CLIENTS',
      'VERIFY_VENDORS',
      'VIEW_PROFILES',
    ],
  },
  {
    name: 'Support Admin',
    description: 'Customer support. Can view profiles and reply to tickets only.',
    isSystem: true,
    permissions: [
      'VIEW_DASHBOARD',
      'VIEW_PROFILES',
      'REPLY_TICKETS',
    ],
  },
];

export async function seedRoles() {
  console.log('🌱 Seeding roles and permissions...');

  // Step 1: Create all permissions
  const permissionRecords: Record<string, Permission> = {};
  for (const [key, permissionData] of Object.entries(PERMISSIONS)) {
    const existing = await prisma.permission.findUnique({
      where: { name: permissionData.name },
    });
    
    if (!existing) {
      const created = await prisma.permission.create({
        data: {
          name: permissionData.name,
          description: `${permissionData.name.replace('can_', '').replace(/_/g, ' ')} permission`,
          category: permissionData.category,
        },
      });
      permissionRecords[key] = created;
      console.log(`  ✅ Created permission: ${permissionData.name}`);
    } else {
      permissionRecords[key] = existing;
      console.log(`  ⏭️ Permission already exists: ${permissionData.name}`);
    }
  }

  // Step 2: Create roles and assign permissions
  const createdRoles: Role[] = [];
  for (const roleData of ROLES) {
    let role = await prisma.role.findUnique({
      where: { name: roleData.name },
    });

    if (!role) {
      role = await prisma.role.create({
        data: {
          name: roleData.name,
          description: roleData.description,
          isSystem: roleData.isSystem,
        },
      });
      console.log(`  ✅ Created role: ${roleData.name}`);
    } else {
      console.log(`  ⏭️ Role already exists: ${roleData.name}`);
    }

    // Assign permissions to role
    for (const permissionKey of roleData.permissions) {
      const permission = permissionRecords[permissionKey];
      if (!permission) {
        console.log(`  ⚠️ Permission "${permissionKey}" not found, skipping`);
        continue;
      }

      const existing = await prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
      });

      if (!existing) {
        await prisma.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId: permission.id,
          },
        });
        console.log(`    ✅ Assigned ${permission.name} to ${roleData.name}`);
      }
    }

    createdRoles.push(role);
  }

  console.log('✅ Role seeding completed!');
  return createdRoles;
}

export { PERMISSIONS };

// If running directly
if (require.main === module) {
  seedRoles()
    .catch((e) => {
      console.error('❌ Role seeding failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}