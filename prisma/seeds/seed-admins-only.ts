/**
 * Standalone script that seeds roles + admin accounts only.
 * Use this when you only need to (re)create admin users without
 * touching regular users, shops, products, etc.
 *
 * Usage: npm run seed:admins
 */
import * as dotenv from 'dotenv';
import { resolve } from 'path';
// Load .env from the project root (two levels up from prisma/seeds/)
dotenv.config({ path: resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { seedRoles } from './roles.seed';
import { seedAdmins } from './admin.seed';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Seeding roles and admins...');

  const roles = await seedRoles();
  await seedAdmins(roles);

  console.log('\n✅ Done!');
  console.log('\n🔑 Admin Credentials:');
  console.log('   superadmin@example.com  /  SuperAdmin123!');
  console.log('   officer@example.com     /  Officer123!');
  console.log('   compliance@example.com  /  Compliance123!');
  console.log('   support@example.com     /  Support123!');
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
