import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { UserRole } from '@karu/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, RelayMessageDto, TransitionBookingDto } from './dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  /**
   * Customers create booking requests. Admins may too — the ops team books on
   * behalf of walk-in and phone customers, and a superadmin should be able to
   * do anything either party can.
   */
  @Roles('customer', 'admin')
  @Post()
  create(@CurrentUser('id') customerId: string, @Body() dto: CreateBookingDto) {
    return this.bookings.create(customerId, dto);
  }

  /** Caller's bookings, scoped by their role. */
  @Get('mine')
  mine(@CurrentUser('id') userId: string, @CurrentUser('role') role: UserRole) {
    return this.bookings.listForUser(userId, role);
  }

  /** One booking — visible only to its customer, its vendor, or an admin. */
  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.bookings.getForUser(id, userId, role);
  }

  /** Message the Karu team about this booking (either party). */
  @Post(':id/message')
  message(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: RelayMessageDto,
  ) {
    return this.bookings.relayMessage(id, userId, role, dto.message);
  }

  /**
   * Booking detail with the parties, shaped per role: a customer sees the
   * provider, a vendor sees only the customer's display name, an admin sees
   * both sides in full.
   */
  @Get(':id/detail')
  detail(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.bookings.getDetailForUser(id, userId, role);
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
