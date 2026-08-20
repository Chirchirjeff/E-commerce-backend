import { PrismaClient, MarketplaceCategory } from '@prisma/client';

const prisma = new PrismaClient();

interface CategoryTree {
  name: string;
  slug: string;
  description?: string;
  children?: CategoryTree[];
}

const MARKETPLACE_CATEGORIES: CategoryTree[] = [
  {
    name: 'Electronics',
    slug: 'electronics',
    description: 'Electronic devices and gadgets',
    children: [
      {
        name: 'Phones & Tablets',
        slug: 'phones-tablets',
        description: 'Mobile phones and tablet devices',
        children: [
          {
            name: 'Smartphones',
            slug: 'smartphones',
            description: 'Smart mobile phones',
          },
          {
            name: 'Feature Phones',
            slug: 'feature-phones',
            description: 'Basic mobile phones',
          },
          {
            name: 'Tablets',
            slug: 'tablets',
            description: 'Tablet devices',
          },
          {
            name: 'Phone Accessories',
            slug: 'phone-accessories',
            description: 'Phone cases, chargers, and more',
          },
        ],
      },
      {
        name: 'Computers',
        slug: 'computers',
        description: 'Computers and computing devices',
        children: [
          {
            name: 'Laptops',
            slug: 'laptops',
            description: 'Laptop computers',
          },
          {
            name: 'Desktops',
            slug: 'desktops',
            description: 'Desktop computers',
          },
          {
            name: 'Monitors',
            slug: 'monitors',
            description: 'Computer monitors and displays',
          },
          {
            name: 'Computer Accessories',
            slug: 'computer-accessories',
            description: 'Keyboards, mice, and more',
          },
        ],
      },
      {
        name: 'Audio',
        slug: 'audio',
        description: 'Audio equipment and accessories',
        children: [
          {
            name: 'Headphones',
            slug: 'headphones',
            description: 'Over-ear headphones',
          },
          {
            name: 'Earphones',
            slug: 'earphones',
            description: 'In-ear earphones',
          },
          {
            name: 'Speakers',
            slug: 'speakers',
            description: 'Audio speakers',
          },
        ],
      },
    ],
  },
  {
    name: 'Fashion',
    slug: 'fashion',
    description: 'Clothing and fashion items',
    children: [
      {
        name: "Men's Fashion",
        slug: 'mens-fashion',
        description: "Men's clothing and accessories",
        children: [
          {
            name: "Men's Shoes",
            slug: 'mens-shoes',
            description: "Men's footwear",
          },
          {
            name: "Men's Clothing",
            slug: 'mens-clothing',
            description: "Men's apparel",
          },
          {
            name: "Men's Accessories",
            slug: 'mens-accessories',
            description: "Men's belts, watches, etc.",
          },
        ],
      },
      {
        name: "Women's Fashion",
        slug: 'womens-fashion',
        description: "Women's clothing and accessories",
        children: [
          {
            name: "Women's Shoes",
            slug: 'womens-shoes',
            description: "Women's footwear",
          },
          {
            name: "Women's Clothing",
            slug: 'womens-clothing',
            description: "Women's apparel",
          },
          {
            name: "Women's Accessories",
            slug: 'womens-accessories',
            description: "Women's bags, jewelry, etc.",
          },
        ],
      },
    ],
  },
  {
    name: 'Home & Living',
    slug: 'home-living',
    description: 'Home and living essentials',
    children: [
      {
        name: 'Furniture',
        slug: 'furniture',
        description: 'Home furniture',
        children: [
          {
            name: 'Bedroom Furniture',
            slug: 'bedroom-furniture',
            description: 'Beds and bedroom items',
          },
          {
            name: 'Living Room Furniture',
            slug: 'living-room-furniture',
            description: 'Sofas and seating',
          },
          {
            name: 'Dining Furniture',
            slug: 'dining-furniture',
            description: 'Dining tables and chairs',
          },
        ],
      },
      {
        name: 'Kitchen',
        slug: 'kitchen',
        description: 'Kitchen appliances and accessories',
        children: [
          {
            name: 'Kitchen Appliances',
            slug: 'kitchen-appliances',
            description: 'Cooking appliances',
          },
          {
            name: 'Cookware',
            slug: 'cookware',
            description: 'Pots, pans, and utensils',
          },
          {
            name: 'Tableware',
            slug: 'tableware',
            description: 'Plates, cups, and dishes',
          },
        ],
      },
      {
        name: 'Home Decor',
        slug: 'home-decor',
        description: 'Decorative items for the home',
      },
    ],
  },
  {
    name: 'Beauty',
    slug: 'beauty',
    description: 'Beauty and personal care products',
    children: [
      {
        name: 'Skincare',
        slug: 'skincare',
        description: 'Face and body skincare',
        children: [
          {
            name: 'Face Care',
            slug: 'face-care',
            description: 'Facial skincare products',
          },
          {
            name: 'Body Care',
            slug: 'body-care',
            description: 'Body skincare and lotions',
          },
        ],
      },
      {
        name: 'Hair Care',
        slug: 'hair-care',
        description: 'Shampoos, conditioners, and treatments',
      },
      {
        name: 'Makeup',
        slug: 'makeup',
        description: 'Cosmetics and makeup products',
        children: [
          {
            name: 'Face Makeup',
            slug: 'face-makeup',
            description: 'Foundation, powder, and more',
          },
          {
            name: 'Eye Makeup',
            slug: 'eye-makeup',
            description: 'Eyeshadow, mascara, and more',
          },
          {
            name: 'Lip Products',
            slug: 'lip-products',
            description: 'Lipsticks and lip glosses',
          },
        ],
      },
    ],
  },
  {
    name: 'Sports',
    slug: 'sports',
    description: 'Sports and outdoor equipment',
    children: [
      {
        name: 'Fitness',
        slug: 'fitness',
        description: 'Fitness and gym equipment',
        children: [
          {
            name: 'Gym Equipment',
            slug: 'gym-equipment',
            description: 'Weights and machines',
          },
          {
            name: 'Yoga & Pilates',
            slug: 'yoga-pilates',
            description: 'Yoga mats and accessories',
          },
        ],
      },
      {
        name: 'Outdoor',
        slug: 'outdoor',
        description: 'Outdoor and camping gear',
      },
      {
        name: 'Sportswear',
        slug: 'sportswear',
        description: 'Sports clothing and shoes',
      },
    ],
  },
];

async function createCategoryRecursive(
  categoryData: CategoryTree,
  parentId: string | null = null,
  level: number = 0,
): Promise<MarketplaceCategory> {
  // Check if category already exists
  const existing = await prisma.marketplaceCategory.findUnique({
    where: { slug: categoryData.slug },
  });

  if (existing) {
    console.log(`  ⏭️ Category already exists: ${categoryData.name}`);
    return existing;
  }

  // Create the category
  const category = await prisma.marketplaceCategory.create({
    data: {
      name: categoryData.name,
      slug: categoryData.slug,
      description: categoryData.description,
      parentId,
      level,
      isActive: true,
      sortOrder: 0,
    },
  });

  console.log(`  ✅ Created category: ${categoryData.name} (Level ${level})`);

  // Recursively create children
  if (categoryData.children && categoryData.children.length > 0) {
    for (const child of categoryData.children) {
      await createCategoryRecursive(child, category.id, level + 1);
    }
  }

  return category;
}

export async function seedMarketplaceCategories() {
  console.log('🌱 Seeding marketplace categories...');

  for (const categoryData of MARKETPLACE_CATEGORIES) {
    await createCategoryRecursive(categoryData);
  }

  console.log('✅ Marketplace categories seeding completed!');
}

// If running directly
if (require.main === module) {
  seedMarketplaceCategories()
    .catch((e) => {
      console.error('❌ Marketplace categories seeding failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
