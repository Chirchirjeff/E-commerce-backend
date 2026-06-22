import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export async function seedUsers(prisma: PrismaClient) {
  console.log('🌱 Seeding users...');
  const hashedPassword = await bcrypt.hash('Jeff@2003', 10);

  const vendorA = await prisma.user.upsert({
    where: { email: 'nike_owner@test.com' },
    update: {},
    create: {
      email: 'nike_owner@test.com',
      password: hashedPassword,
      name: 'Phil Knight',
    },
  });

  const vendorB = await prisma.user.upsert({
    where: { email: 'adidas_owner@test.com' },
    update: {},
    create: {
      email: 'adidas_owner@test.com',
      password: hashedPassword,
      name: 'Adi Dassler',
    },
  });

  return { vendorA, vendorB };
}