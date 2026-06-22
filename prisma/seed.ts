// prisma/seed.ts

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedUsers } from './seeds/users.seed';
import { seedShops } from './seeds/shops.seed';
import { seedCategories } from './seeds/categories.seed';
import { seedProducts } from './seeds/products.seed';

// Prisma automatically reads DATABASE_URL from schema.prisma
const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Clear-out phase: Purging existing relational database records...');

  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.shop.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('🚀 Starting modular platform database seeding pipeline...');

  const users = await seedUsers(prisma);
  const shops = await seedShops(prisma, users);

  await seedCategories(prisma, shops);
  await seedProducts(prisma, shops);

  console.log('✨ All modules executed successfully! Data ecosystem ready.');
}

main()
  .catch((error) => {
    console.error('❌ Modular seed suite execution failure context:');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });