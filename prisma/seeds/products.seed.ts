import { PrismaClient, Shop } from '@prisma/client';

const prisma = new PrismaClient();

const PRODUCTS = [
  {
    name: 'Wireless Headphones Pro',
    description: 'High-quality wireless headphones with noise cancellation.',
    price: 149.99,
    stockQuantity: 45,
    thumbnailUrl: 'https://via.placeholder.com/300x300?text=Headphones',
    marketplaceCategorySlug: 'headphones',
    legacyCategoryName: 'Electronics',
  },
  {
    name: 'Premium Cotton T-Shirt',
    description: '100% organic cotton t-shirt.',
    price: 29.99,
    stockQuantity: 120,
    thumbnailUrl: 'https://via.placeholder.com/300x300?text=T-Shirt',
    marketplaceCategorySlug: 'mens-clothing',
    legacyCategoryName: 'Clothing & Fashion',
  },
  {
    name: 'Smart Home Hub',
    description: 'Control all your smart devices.',
    price: 199.99,
    stockQuantity: 12,
    thumbnailUrl: 'https://via.placeholder.com/300x300?text=Smart+Hub',
    marketplaceCategorySlug: 'computer-accessories',
    legacyCategoryName: 'Electronics',
  },
  {
    name: 'Organic Coffee Beans',
    description: 'Premium organic coffee beans.',
    price: 24.99,
    stockQuantity: 0,
    thumbnailUrl: 'https://via.placeholder.com/300x300?text=Coffee',
    marketplaceCategorySlug: 'cookware',
    legacyCategoryName: 'Food & Beverages',
  },
  {
    name: 'Yoga Mat Premium',
    description: 'Eco-friendly non-slip yoga mat.',
    price: 39.99,
    stockQuantity: 75,
    thumbnailUrl: 'https://via.placeholder.com/300x300?text=Yoga+Mat',
    marketplaceCategorySlug: 'yoga-pilates',
    legacyCategoryName: 'Sports & Outdoors',
  },
  {
    name: 'Gaming Keyboard',
    description: 'Mechanical gaming keyboard with RGB lighting.',
    price: 89.99,
    stockQuantity: 30,
    thumbnailUrl: 'https://via.placeholder.com/300x300?text=Keyboard',
    marketplaceCategorySlug: 'computer-accessories',
    legacyCategoryName: 'Electronics',
  },
  {
    name: 'Designer Sunglasses',
    description: 'Polarized UV-protection sunglasses.',
    price: 79.99,
    stockQuantity: 20,
    thumbnailUrl: 'https://via.placeholder.com/300x300?text=Sunglasses',
    marketplaceCategorySlug: 'mens-accessories',
    legacyCategoryName: 'Clothing & Fashion',
  },
  {
    name: 'Natural Skincare Set',
    description: 'Organic skincare set with face wash and moisturizer.',
    price: 54.99,
    stockQuantity: 40,
    thumbnailUrl: 'https://via.placeholder.com/300x300?text=Skincare',
    marketplaceCategorySlug: 'face-care',
    legacyCategoryName: 'Health & Beauty',
  },
];

export async function seedProducts(shop: Shop) {
  console.log('🌱 Seeding products...');

  for (const productData of PRODUCTS) {
    // Find the marketplace category by slug
    const marketplaceCategory = await prisma.marketplaceCategory.findUnique({
      where: { slug: productData.marketplaceCategorySlug },
    });

    if (!marketplaceCategory) {
      console.log(`  ⚠️ Marketplace category "${productData.marketplaceCategorySlug}" not found, skipping product: ${productData.name}`);
      continue;
    }

    const existingProduct = await prisma.product.findFirst({
      where: {
        name: productData.name,
        shopId: shop.id,
      },
    });

    if (existingProduct) {
      console.log(`  ⏭️ Product already exists: ${productData.name}`);
      continue;
    }

    await prisma.product.create({
      data: {
        name: productData.name,
        description: productData.description,
        price: productData.price,
        stockQuantity: productData.stockQuantity,
        thumbnailUrl: productData.thumbnailUrl,
        images: [productData.thumbnailUrl],
        shopId: shop.id,
        marketplaceCategoryId: marketplaceCategory.id,
      },
    });
    console.log(`  ✅ Product created: ${productData.name}`);
  }

  console.log('✅ Products seeding completed!');
}

// If running directly
if (require.main === module) {
  console.log('⚠️ This seeder should be called from the main seed.ts file');
}