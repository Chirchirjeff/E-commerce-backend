/**
 * Clean Demo Data Script
 * 
 * Removes all seeded dummy data (orders, payouts, reviews) from the database.
 * This is useful when you've had demo data seeded but want to start fresh
 * with real data for user testing.
 * 
 * Usage: npx ts-node prisma/seeds/clean-demo-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanDemoData() {
  console.log('🗑️  Cleaning up demo data...');
  console.log('================================');

  try {
    // Delete all orders (and their order items via cascade)
    console.log('\n📋 Deleting all orders and order items...');
    const ordersDeleted = await prisma.order.deleteMany({});
    console.log(`  ✅ Deleted ${ordersDeleted.count} orders`);

    // Delete all payouts
    console.log('\n📋 Deleting all payouts...');
    const payoutsDeleted = await prisma.payout.deleteMany({});
    console.log(`  ✅ Deleted ${payoutsDeleted.count} payouts`);

    // Delete all reviews
    console.log('\n📋 Deleting all reviews...');
    const reviewsDeleted = await prisma.review.deleteMany({});
    console.log(`  ✅ Deleted ${reviewsDeleted.count} reviews`);

    console.log('\n================================');
    console.log('✅ Demo data cleanup completed!');
    console.log('================================');
    console.log('\n⚠️  To re-seed demo data later, run:');
    console.log('   SEED_DEMO_DATA=true npm run seed');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
}

cleanDemoData()
  .catch((e) => {
    console.error('❌ Cleanup failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
