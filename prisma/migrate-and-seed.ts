/**
 * migrate-and-seed.ts
 *
 * Runs `prisma migrate deploy` to apply all pending migrations, then
 * executes the full seed sequence.
 *
 * Usage:
 *   npm run migrate:seed          — migrate + seed (production-safe, no data loss)
 *   npm run migrate:seed:reset    — drop everything, re-migrate, re-seed (dev only!)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env before PrismaClient is instantiated
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { seedRoles } from './seeds/roles.seed';
import { seedAdmins } from './seeds/admin.seed';
import { seedRegularUsers } from './seeds/users.seed';
import { seedShops } from './seeds/shops.seed';
import { seedMarketplaceCategories } from './seeds/marketplace-categories.seed';
import { seedCategories } from './seeds/categories.seed';
import { seedProducts } from './seeds/products.seed';
import { seedOrders, seedPayouts, seedReviews } from './seeds/orders.seed';

const prisma = new PrismaClient();

// ─── helpers ────────────────────────────────────────────────────────────────

function runMigrations(reset = false) {
  if (reset) {
    console.log('\n⚠️  RESET MODE — dropping all data and re-applying migrations');
    console.log('   (This should only be used in development!)');
    console.log('--------------------------------');
    execSync('npx prisma migrate reset --force --skip-seed', {
      stdio: 'inherit',
    });
    console.log('✅ Database reset and migrations applied.');
  } else {
    console.log('\n🗃️  Applying pending migrations (prisma migrate deploy)...');
    console.log('--------------------------------');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('✅ Migrations applied.');
  }
}

async function runSeed() {
  console.log('\n🚀 Starting database seeding...');
  console.log('================================');

  // STEP 1: Roles & Permissions
  console.log('\n📋 STEP 1: Seeding Roles & Permissions');
  console.log('--------------------------------');
  const roles = await seedRoles();

  // STEP 2: Admin Users
  console.log('\n📋 STEP 2: Seeding Admin Users');
  console.log('--------------------------------');
  await seedAdmins(roles);

  // STEP 4: Regular Users
  console.log('\n📋 STEP 3: Seeding Regular Users');
  console.log('--------------------------------');
  const adminUser = await seedRegularUsers();

  // STEP 5: Marketplace Categories
  console.log('\n📋 STEP 4: Seeding Marketplace Categories');
  console.log('--------------------------------');
  await seedMarketplaceCategories();

  // STEP 6: Shops
  console.log('\n📋 STEP 5: Seeding Shops');
  console.log('--------------------------------');
  const shop = await seedShops(adminUser);

  // STEP 7: Categories (Legacy)
  console.log('\n📋 STEP 6: Seeding Legacy Categories');
  console.log('--------------------------------');
  await seedCategories(shop);

  // STEP 8: Products
  console.log('\n📋 STEP 7: Seeding Products');
  console.log('--------------------------------');
  await seedProducts(shop);

  // STEP 9: Orders, Payouts & Reviews
  console.log('\n📋 STEP 8: Seeding Orders, Payouts & Reviews');
  console.log('--------------------------------');
  await seedOrders(shop, adminUser);
  await seedPayouts(shop);
  await seedReviews(shop, adminUser);

  console.log('\n================================');
  console.log('✅ All seeding completed successfully!');
  console.log('================================');
  console.log('\n🔑 Admin Credentials:');
  console.log('   Super Admin    — superadmin@example.com  / SuperAdmin123!');
  console.log('   KYC Officer    — officer@example.com     / Officer123!');
  console.log('   Compliance HOD — compliance@example.com  / Compliance123!');
  console.log('   Support Admin  — support@example.com     / Support123!');
  console.log('\n📝 Regular User Credentials:');
  console.log('   Shop Owner     — admin@example.com       / admin123456');
  console.log('   Test User      — test@example.com        / test123456');
  console.log('================================');
}

// ─── entry point ────────────────────────────────────────────────────────────

async function main() {
  const isReset = process.argv.includes('--reset');

  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║      MIGRATE & SEED  (E-Commerce)    ║');
  console.log('╚══════════════════════════════════════╝');

  // 1. Migrate
  runMigrations(isReset);

  // 2. Seed
  await runSeed();
}

main()
  .catch((e) => {
    console.error('\n❌ migrate-and-seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
