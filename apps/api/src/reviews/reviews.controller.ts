import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { UserRole } from '@karu/shared';
import { CurrentUser, Public } from '../auth/decorators';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto';

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Leave a review on a completed booking. Side is derived from the booking. */
  @Post('bookings/:id/review')
  create(
    @Param('id') bookingId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(bookingId, userId, role, dto);
  }

  /** Reviews the caller has written, for the bookings they ask about. */
  @Get('reviews/mine')
  mine(@CurrentUser('id') userId: string, @Query('booking_ids') bookingIds?: string) {
    return this.reviews.mineForBookings(userId, bookingIds ? bookingIds.split(',') : []);
  }

  /** Public reputation for a provider. */
  @Public()
  @Get('vendors/:id/reviews')
  forVendor(@Param('id') vendorId: string) {
    return this.reviews.listForVendor(vendorId);
  }
}
