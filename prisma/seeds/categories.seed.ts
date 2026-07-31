import { PrismaClient, Shop, Category } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIES = [
  'Electronics',
  'Clothing & Fashion',
  'Home & Garden',
  'Books & Media',
  'Food & Beverages',
  'Health & Beauty',
  'Sports & Outdoors',
  'Toys & Games',
];

export async function seedCategories(shop: Shop): Promise<Record<string, string>> {
  console.log('🌱 Seeding categories...');

  const categoryMap: Record<string, string> = {};

  for (const categoryName of CATEGORIES) {
    const existingCategory = await prisma.category.findFirst({
      where: {
        name: categoryName,
        shopId: shop.id,
      },
    });

    let category: Category;

    if (existingCategory) {
      category = existingCategory;
      console.log(`  ⏭️ Category already exists: ${categoryName}`);
    } else {
      category = await prisma.category.create({
        data: {
          name: categoryName,
          shopId: shop.id,
        },
      });
      console.log(`  ✅ Category created: ${categoryName}`);
    }

    categoryMap[categoryName] = category.id;
  }

  console.log('✅ Categories seeding completed!');
  return categoryMap;
}

// If running directly
if (require.main === module) {
  console.log('⚠️ This seeder should be called from the main seed.ts file');
}