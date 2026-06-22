// prisma/seeds/products.seed.ts
import { PrismaClient } from '@prisma/client';

export async function seedProducts(prisma: PrismaClient, shops: any) {
  console.log('👟 Seeding products...');

  const productsData = [
    {
      name: 'Air Max 90',
      description: 'Iconic low-top running lifestyle shoe.',
      price: 130.00,
      shopId: shops.shopA.id, // Links directly to Nike
    },
    {
      name: 'Windrunner Jacket',
      description: 'Classic water-repellent running shield.',
      price: 100.00,
      shopId: shops.shopA.id, // Links directly to Nike
    },
    {
      name: 'Ultraboost Light',
      description: 'High-performance energy return running shoes.',
      price: 190.00,
      shopId: shops.shopB.id, // Links directly to Adidas
    },
  ];

  for (const product of productsData) {
    await prisma.product.create({
      data: product,
    });
  }
}