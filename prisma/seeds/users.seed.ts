import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../../.env') });

import { PrismaClient, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export async function seedRegularUsers(): Promise<User> {
  console.log('🌱 Seeding regular users...');

  // Admin user credentials (this is for the Customer/Shop owner account)
  const adminEmail = 'admin@example.com';
  const adminPassword = 'admin123456';

  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  let admin: User;

  if (existingAdmin) {
    console.log(`  ✅ Admin user already exists: ${adminEmail}`);
    admin = existingAdmin;
  } else {
    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Create admin user
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: 'Admin User',
      },
    });

    console.log(`  ✅ Admin user created: ${adminEmail}`);
    console.log(`  📝 Password: ${adminPassword}`);
  }

  // Create a regular test user (optional)
  const testUserEmail = 'test@example.com';
  const testUserPassword = 'test123456';

  const existingTestUser = await prisma.user.findUnique({
    where: { email: testUserEmail },
  });

  if (!existingTestUser) {
    const testHashedPassword = await bcrypt.hash(testUserPassword, 10);
    
    await prisma.user.create({
      data: {
        email: testUserEmail,
        password: testHashedPassword,
        name: 'Test User',
      },
    });
    
    console.log(`  ✅ Test user created: ${testUserEmail}`);
    console.log(`  📝 Password: ${testUserPassword}`);
  }

  console.log('✅ Regular users seeding completed!');
  return admin;
}

// If running directly
if (require.main === module) {
  seedRegularUsers()
    .catch((e) => {
      console.error('❌ User seeding failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}