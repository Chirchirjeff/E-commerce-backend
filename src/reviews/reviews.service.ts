import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a review. Rules:
   * - The buyer must have at least one order for this product where
   *   paymentStatus = 'SUCCESS'.
   * - A buyer may only review a product once (enforced by DB unique constraint
   *   and checked here for a clean error message).
   * - Reviews are auto-approved (status = 'approved') so they appear
   *   immediately. An admin moderation layer can be added later.
   */
  async create(dto: CreateReviewDto, buyerId: string) {
    const product = await this.prisma.client.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, shopId: true },
    });

    if (!product) throw new NotFoundException('Product not found');

    // Check the buyer has a paid order containing this product
    const paidOrder = await this.prisma.client.orderItem.findFirst({
      where: {
        productId: dto.productId,
        order: {
          buyerId,
          paymentStatus: { in: ['PAID', 'SUCCESS'] }, // M-Pesa callback writes PAID
        },
      },
      select: { id: true },
    });

    if (!paidOrder) {
      throw new ForbiddenException(
        'You can only review a product after a successful purchase',
      );
    }

    // Check for existing review
    const existing = await this.prisma.client.review.findUnique({
      where: { productId_userId: { productId: dto.productId, userId: buyerId } },
    });

    if (existing) {
      throw new BadRequestException('You have already reviewed this product');
    }

    return this.prisma.client.review.create({
      data: {
        productId: dto.productId,
        userId: buyerId,
        shopId: product.shopId,
        rating: dto.rating,
        comment: dto.comment,
        status: 'approved', // auto-approve; adjust when moderation layer is added
      },
      select: {
        id: true,
        rating: true,
        comment: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * List all approved reviews for a product, most recent first.
   * Also returns aggregate stats (averageRating, reviewCount).
   */
  async findByProduct(productId: string) {
    const [reviews, aggregate] = await Promise.all([
      this.prisma.client.review.findMany({
        where: { productId, status: 'approved' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      }),
      this.prisma.client.review.aggregate({
        where: { productId, status: 'approved' },
        _avg: { rating: true },
        _count: { id: true },
      }),
    ]);

    return {
      reviews,
      averageRating: aggregate._avg.rating ?? 0,
      reviewCount: aggregate._count.id,
    };
  }

  /**
   * Check whether the authenticated user has already purchased a given product
   * with a successful payment. Used by the webapp to decide whether to show
   * the review form.
   */
  async canReview(productId: string, buyerId: string) {
    const paidOrder = await this.prisma.client.orderItem.findFirst({
      where: {
        productId,
        order: { buyerId, paymentStatus: { in: ['PAID', 'SUCCESS'] } },
      },
      select: { id: true },
    });

    const existing = await this.prisma.client.review.findUnique({
      where: { productId_userId: { productId, userId: buyerId } },
      select: { id: true },
    });

    return {
      canReview: !!paidOrder && !existing,
      hasPurchased: !!paidOrder,
      hasReviewed: !!existing,
    };
  }
}
