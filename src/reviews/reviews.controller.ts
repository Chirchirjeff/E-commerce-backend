import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipGuard } from '../auth/decorators/skip-guard.decorator';

@Controller('reviews')
@UseGuards(PermissionsGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * POST /reviews
   * Buyer submits a review for a product they have purchased and paid for.
   * Authentication is required (JWT guard is global).
   */
  @Post()
  async create(@Body() dto: CreateReviewDto, @CurrentUser() user: any) {
    return this.reviewsService.create(dto, user.id);
  }

  /**
   * GET /reviews/product/:productId
   * Public endpoint returning all approved reviews + aggregate stats for a product.
   */
  @Get('product/:productId')
  @SkipGuard()
  async findByProduct(@Param('productId') productId: string) {
    return this.reviewsService.findByProduct(productId);
  }

  /**
   * GET /reviews/can-review/:productId
   * Returns whether the current authenticated user can post a review for this product.
   * Used by the webapp to conditionally show the review form.
   */
  @Get('can-review/:productId')
  async canReview(
    @Param('productId') productId: string,
    @CurrentUser() user: any,
  ) {
    return this.reviewsService.canReview(productId, user.id);
  }
}
