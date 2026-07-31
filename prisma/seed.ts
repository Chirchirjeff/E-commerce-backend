import { PrismaClient } from '@prisma/client';
import { seedRoles } from './seeds/roles.seed';
import { seedAdmins } from './seeds/admin.seed';
import { seedRegularUsers } from './seeds/users.seed';
import { seedShops } from './seeds/shops.seed';
import { seedCategories } from './seeds/categories.seed';
import { seedProducts } from './seeds/products.seed';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting database seeding...');
  console.log('================================');

  try {
    // STEP 1: Seed Roles & Permissions (Foundation)
    console.log('\n📋 STEP 1: Seeding Roles & Permissions');
    console.log('--------------------------------');
    const roles = await seedRoles();
    
    // STEP 2: Seed Admin Users
    console.log('\n📋 STEP 2: Seeding Admin Users');
    console.log('--------------------------------');
    const admins = await seedAdmins(roles);
    
    // STEP 3: Seed Regular Users (Customers)
    console.log('\n📋 STEP 3: Seeding Regular Users');
    console.log('--------------------------------');
    const adminUser = await seedRegularUsers();
    
    // STEP 4: Seed Shops
    console.log('\n📋 STEP 4: Seeding Shops');
    console.log('--------------------------------');
    const shop = await seedShops(adminUser);
    
    // STEP 5: Seed Categories
    console.log('\n📋 STEP 5: Seeding Categories');
    console.log('--------------------------------');
    const categoryMap = await seedCategories(shop);
    
    // STEP 6: Seed Products
    console.log('\n📋 STEP 6: Seeding Products');
    console.log('--------------------------------');
    await seedProducts(shop, categoryMap);

    console.log('\n================================');
    console.log('✅ All seeding completed successfully!');
    console.log('================================');
    console.log('\n🔑 Admin Credentials:');
    console.log('   Super Admin:');
    console.log('   Email: superadmin@example.com');
    console.log('   Password: SuperAdmin123!');
    console.log('   Role: Super Admin');
    console.log('');
    console.log('   KYC Officer:');
    console.log('   Email: officer@example.com');
    console.log('   Password: Officer123!');
    console.log('   Role: KYC Officer');
    console.log('');
    console.log('   Compliance HOD:');
    console.log('   Email: compliance@example.com');
    console.log('   Password: Compliance123!');
    console.log('   Role: Compliance HOD');
    console.log('');
    console.log('   Support Admin:');
    console.log('   Email: support@example.com');
    console.log('   Password: Support123!');
    console.log('   Role: Support Admin');
    console.log('');
    console.log('📝 Regular User Credentials:');
    console.log('   Admin User (Shop Owner):');
    console.log('   Email: admin@example.com');
    console.log('   Password: admin123456');
    console.log('   Role: Regular User');
    console.log('');
    console.log('   Test User:');
    console.log('   Email: test@example.com');
    console.log('   Password: test123456');
    console.log('   Role: Regular User');
    console.log('================================');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });