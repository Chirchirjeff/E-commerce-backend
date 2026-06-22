// prisma/seeds/categories.seed.ts
import { PrismaClient } from '@prisma/client';

export async function seedCategories(prisma: PrismaClient, shops: any) {
  console.log('📁 Seeding categories...');

  const catNikeShoes = await prisma.category.create({
    data: { name: 'Footwear', shopId: shops.shopA.id },
  });

  const catNikeApparel = await prisma.category.create({
    data: { name: 'Apparel', shopId: shops.shopA.id },
  });

  const catAdidasShoes = await prisma.category.create({
    data: { name: 'Running Shoes', shopId: shops.shopB.id },
  });

  return { catNikeShoes, catNikeApparel, catAdidasShoes };
}