import { PrismaClient, Role, Admin } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

interface AdminAccount {
  email: string;
  password: string;
  name: string;
  roleName: string;
}

// Define test admin accounts
const ADMIN_ACCOUNTS: AdminAccount[] = [
  {
    email: 'superadmin@example.com',
    password: 'SuperAdmin123!',
    name: 'Super Admin',
    roleName: 'Super Admin',
  },
  {
    email: 'officer@example.com',
    password: 'Officer123!',
    name: 'KYC Officer',
    roleName: 'KYC Officer',
  },
  {
    email: 'compliance@example.com',
    password: 'Compliance123!',
    name: 'Compliance HOD',
    roleName: 'Compliance HOD',
  },
  {
    email: 'support@example.com',
    password: 'Support123!',
    name: 'Support Admin',
    roleName: 'Support Admin',
  },
];

export async function seedAdmins(roles: Role[]): Promise<Admin[]> {
  console.log('🌱 Seeding admin users...');

  const roleMap: Record<string, Role> = {};
  roles.forEach((role) => {
    roleMap[role.name] = role;
  });

  const createdAdmins: Admin[] = [];

  for (const adminData of ADMIN_ACCOUNTS) {
    const role = roleMap[adminData.roleName];
    if (!role) {
      console.log(`  ⚠️ Role "${adminData.roleName}" not found, skipping admin creation`);
      continue;
    }

    // Check if admin already exists
    const existing = await prisma.admin.findUnique({
      where: { email: adminData.email },
    });

    if (existing) {
      console.log(`  ⏭️ Admin already exists: ${adminData.email}`);
      createdAdmins.push(existing);
      continue;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(adminData.password, 10);

    // Create admin
    const admin = await prisma.admin.create({
      data: {
        email: adminData.email,
        password: hashedPassword,
        name: adminData.name,
        roleId: role.id,
        isActive: true,
      },
    });

    console.log(`  ✅ Admin created: ${adminData.email} (${adminData.roleName})`);
    createdAdmins.push(admin);
  }

  console.log('✅ Admin seeding completed!');
  return createdAdmins;
}

// If running directly
if (require.main === module) {
  // This is a sub-seeder, it needs roles to be seeded first
  console.log('⚠️ This seeder should be called from the main seed.ts file');
  console.log('⚠️ Please run the main seed.ts instead');
}