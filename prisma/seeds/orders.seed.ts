import { PrismaClient, Shop, User, Order } from '@prisma/client';

const prisma = new PrismaClient();

const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

interface OrderData {
  statusLabel: string;
  status: string;
  itemCount: number;
  quantities: number[];
}

const ORDERS_TO_SEED: OrderData[] = [
  { statusLabel: 'Delivered Order 1',   status: 'delivered',  itemCount: 2, quantities: [1, 2] },
  { statusLabel: 'Delivered Order 2',   status: 'delivered',  itemCount: 3, quantities: [1, 1, 1] },
  { statusLabel: 'Delivered Order 3',   status: 'delivered',  itemCount: 1, quantities: [2] },
  { statusLabel: 'Processing Order 1',  status: 'processing', itemCount: 2, quantities: [1, 1] },
  { statusLabel: 'Processing Order 2',  status: 'processing', itemCount: 1, quantities: [3] },
  { statusLabel: 'Pending Order 1',     status: 'pending',    itemCount: 2, quantities: [1, 2] },
  { statusLabel: 'Pending Order 2',     status: 'pending',    itemCount: 1, quantities: [1] },
  { statusLabel: 'Shipped Order 1',     status: 'shipped',    itemCount: 2, quantities: [1, 1] },
  { statusLabel: 'Cancelled Order 1',   status: 'cancelled',  itemCount: 1, quantities: [1] },
  { statusLabel: 'Cancelled Order 2',   status: 'cancelled',  itemCount: 2, quantities: [1, 1] },
];

export async function seedOrders(shop: Shop, buyer: User): Promise<Order[]> {
  console.log('🌱 Seeding orders...');

  // Fetch all products that belong to the shop so we can attach order items
  const products = await prisma.product.findMany({
    where: { shopId: shop.id },
  });

  if (products.length === 0) {
    console.log('  ⚠️  No products found for shop. Skipping order seeding.');
    console.log('     Run products seed first: npm run seed:products');
    return [];
  }

  const createdOrders: Order[] = [];

  for (const orderData of ORDERS_TO_SEED) {
    // Idempotency: check by shop + buyer + status label stored as a note — we use a
    // deterministic reference string embedded in the order so re-runs are safe.
    const reference = `seed:${shop.id}:${buyer.id}:${orderData.statusLabel.toLowerCase().replace(/\s+/g, '-')}`;

    const existingOrder = await prisma.order.findFirst({
      where: {
        shopId: shop.id,
        buyerId: buyer.id,
        // status acts as an additional discriminator; we rely on the
        // combination being unique enough for seed data
        status: orderData.status,
        // We embed the reference in the total field comment via a
        // dedicated search — instead we just check by payout reference
        // stored on the related payout, but orders have no reference field.
        // Safest: count existing seeded orders per status and skip if met.
      },
    });

    // More reliable idempotency: count how many seeded orders with this
    // exact status already exist that were created by this buyer for this shop
    const existingCount = await prisma.order.count({
      where: {
        shopId: shop.id,
        buyerId: buyer.id,
        status: orderData.status,
      },
    });

    // Count how many orders we intend to have with this status
    const intendedCount = ORDERS_TO_SEED.filter((o) => o.status === orderData.status).length;

    if (existingCount >= intendedCount) {
      console.log(`  ⏭️  Orders already seeded for status: ${orderData.status}`);
      // Only log once per status, collect existing records
      const existing = await prisma.order.findMany({
        where: { shopId: shop.id, buyerId: buyer.id, status: orderData.status },
      });
      createdOrders.push(...existing);
      // Break out of loop for this status group — handled below via the
      // grouped approach; for now just continue
      continue;
    }

    // Pick products in a round-robin fashion so each order has different items
    const selectedProducts = products.slice(0, Math.min(orderData.itemCount, products.length));

    // Build order items and compute total
    const items = selectedProducts.map((product, idx) => {
      const quantity = orderData.quantities[idx] ?? 1;
      const price = product.price;
      return {
        productId: product.id,
        quantity,
        price,
        subtotal: price * quantity,
      };
    });

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);

    // Generate a unique order number for this seed entry
    const seedDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seedPrefix = `QZ-${seedDate}-`;
    const lastSeedOrder = await prisma.order.findFirst({
      where: { orderNumber: { startsWith: seedPrefix } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    const seedSeq = lastSeedOrder
      ? parseInt(lastSeedOrder.orderNumber.split('-')[2], 10) + 1
      : createdOrders.length + 1;
    const seedOrderNumber = `${seedPrefix}${String(seedSeq).padStart(5, '0')}`;

    const order = await prisma.order.create({
      data: {
        orderNumber: seedOrderNumber,
        trackingToken: require('crypto').randomBytes(24).toString('hex'),
        shopId: shop.id,
        buyerId: buyer.id,
        status: orderData.status,
        total: parseFloat(total.toFixed(2)),
        items: {
          create: items,
        },
      },
    });

    console.log(
      `  ✅ Order created: ${orderData.statusLabel} (${orderData.status}) — $${total.toFixed(2)}`,
    );
    createdOrders.push(order);
  }

  console.log(`✅ Orders seeding completed! (${createdOrders.length} orders)`);
  return createdOrders;
}

export async function seedPayouts(shop: Shop): Promise<void> {
  console.log('🌱 Seeding payouts...');

  const PAYOUTS = [
    { amount: 1250.00, period: '2026-01', status: 'paid',    reference: 'PAY-2026-01-001', processedAt: new Date('2026-02-05') },
    { amount: 2340.50, period: '2026-02', status: 'paid',    reference: 'PAY-2026-02-001', processedAt: new Date('2026-03-05') },
    { amount: 1875.75, period: '2026-03', status: 'paid',    reference: 'PAY-2026-03-001', processedAt: new Date('2026-04-05') },
    { amount: 3100.00, period: '2026-04', status: 'paid',    reference: 'PAY-2026-04-001', processedAt: new Date('2026-05-05') },
    { amount: 2200.25, period: '2026-05', status: 'paid',    reference: 'PAY-2026-05-001', processedAt: new Date('2026-06-05') },
    { amount: 1950.00, period: '2026-06', status: 'pending', reference: null,               processedAt: null },
    { amount: 2750.00, period: '2026-07', status: 'pending', reference: null,               processedAt: null },
  ];

  for (const payoutData of PAYOUTS) {
    const existing = await prisma.payout.findFirst({
      where: { shopId: shop.id, period: payoutData.period },
    });

    if (existing) {
      console.log(`  ⏭️  Payout already exists: ${payoutData.period}`);
      continue;
    }

    await prisma.payout.create({
      data: {
        shopId: shop.id,
        amount: payoutData.amount,
        period: payoutData.period,
        status: payoutData.status,
        reference: payoutData.reference,
        processedAt: payoutData.processedAt,
      },
    });
    console.log(`  ✅ Payout created: ${payoutData.period} — $${payoutData.amount} (${payoutData.status})`);
  }

  console.log('✅ Payouts seeding completed!');
}

export async function seedReviews(shop: Shop, buyer: User): Promise<void> {
  console.log('🌱 Seeding reviews...');

  const products = await prisma.product.findMany({
    where: { shopId: shop.id },
    take: 5,
  });

  if (products.length === 0) {
    console.log('  ⚠️  No products found. Skipping review seeding.');
    return;
  }

  const REVIEWS = [
    { rating: 5, comment: 'Absolutely love this product! Exceeded my expectations.', status: 'approved' },
    { rating: 4, comment: 'Great quality, fast shipping. Would buy again.', status: 'approved' },
    { rating: 3, comment: 'Decent product for the price. Nothing special.', status: 'approved' },
    { rating: 5, comment: 'Top notch! Customer service was also excellent.', status: 'approved' },
    { rating: 2, comment: 'Product arrived damaged. Waiting for replacement.', status: 'pending' },
  ];

  for (let i = 0; i < Math.min(REVIEWS.length, products.length); i++) {
    const product = products[i];
    const reviewData = REVIEWS[i];

    const existing = await prisma.review.findUnique({
      where: {
        productId_userId: {
          productId: product.id,
          userId: buyer.id,
        },
      },
    });

    if (existing) {
      console.log(`  ⏭️  Review already exists for product: ${product.name}`);
      continue;
    }

    await prisma.review.create({
      data: {
        productId: product.id,
        userId: buyer.id,
        shopId: shop.id,
        rating: reviewData.rating,
        comment: reviewData.comment,
        status: reviewData.status,
      },
    });
    console.log(`  ✅ Review created: ${reviewData.rating}⭐ on "${product.name}"`);
  }

  console.log('✅ Reviews seeding completed!');
}

// If running directly
if (require.main === module) {
  async function run() {
    console.log('🌱 Running orders/payouts/reviews seed standalone...');

    const shop = await prisma.shop.findFirst({ where: { slug: 'test-shop' } });
    const buyer = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });

    if (!shop || !buyer) {
      console.error('❌ Shop or buyer not found. Run the main seed first: npm run seed');
      process.exit(1);
    }

    await seedOrders(shop, buyer);
    await seedPayouts(shop);
    await seedReviews(shop, buyer);
  }

  run()
    .catch((e) => {
      console.error('❌ Orders seeding failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
