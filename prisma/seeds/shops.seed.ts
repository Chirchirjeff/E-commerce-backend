// prisma/seeds/shops.seed.ts
import { PrismaClient } from '@prisma/client';

export async function seedShops(prisma: PrismaClient, users: any) {
  console.log('🏬 Seeding shops...');
  
  const shopA = await prisma.shop.upsert({
    where: { slug: 'nike' },
    update: {},
    create: {
      name: 'Nike Official',
      slug: 'nike',
      owner: { connect: { id: users.vendorA.id } }, // ✨ Matches your schema relation name!
    },
  });

  const shopB = await prisma.shop.upsert({
    where: { slug: 'adidas' },
    update: {},
    create: {
      name: 'Adidas Active',
      slug: 'adidas',
      owner: { connect: { id: users.vendorB.id } },
    },
  });

  return { shopA, shopB };
}