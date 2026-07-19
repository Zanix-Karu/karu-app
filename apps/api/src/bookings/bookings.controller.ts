import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { UserRole } from '@karu/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, TransitionBookingDto } from './dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  /** Only customers create booking requests. */
  @Roles('customer')
  @Post()
  create(@CurrentUser('id') customerId: string, @Body() dto: CreateBookingDto) {
    return this.bookings.create(customerId, dto);
  }

  /** Caller's bookings, scoped by their role. */
  @Get('mine')
  mine(@CurrentUser('id') userId: string, @CurrentUser('role') role: UserRole) {
    return this.bookings.listForUser(userId, role);
  }

  /** Advance the booking state machine (vendor confirm/reject, customer cancel, …). */
  @Patch(':id/status')
  transition(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: TransitionBookingDto,
  ) {
    return this.bookings.transition(id, userId, role, dto.status, dto.vendor_note);
  }
}
