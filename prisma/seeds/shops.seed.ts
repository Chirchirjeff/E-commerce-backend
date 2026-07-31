import { PrismaClient, User, Shop } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedShops(adminUser: User): Promise<Shop> {
  console.log('🌱 Seeding shops...');

  // Check if shop already exists
  const existingShop = await prisma.shop.findFirst({
    where: { slug: 'test-shop' },
  });

  let shop: Shop;

  if (existingShop) {
    console.log('  ✅ Test shop already exists');
    shop = existingShop;
  } else {
    shop = await prisma.shop.create({
      data: {
        name: 'Test Shop',
        slug: 'test-shop',
        businessDescription: 'This is a test shop for the admin dashboard demo',
        businessLogo: 'https://via.placeholder.com/200x200?text=Test+Shop',
        ownerId: adminUser.id,
        verificationStatus: 'ACTIVE', // Pre-verified for demo
        verifiedAt: new Date(),
        verifiedBy: null,
      },
    });
    console.log(`  ✅ Shop created: ${shop.name}`);
  }

  console.log('✅ Shops seeding completed!');
  return shop;
}

// If running directly
if (require.main === module) {
  // This is a sub-seeder, it needs users to be seeded first
  console.log('⚠️ This seeder should be called from the main seed.ts file');
}