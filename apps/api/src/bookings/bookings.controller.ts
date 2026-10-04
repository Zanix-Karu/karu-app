import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { UserRole } from '@karu/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { BookingsService } from './bookings.service';
import { InspectionsService } from './inspections.service';
import { TrackingService } from './tracking.service';
import {
  CreateBookingDto,
  InspectionUploadDto,
  RecordInspectionDto,
  TrackingPointDto,
  RelayMessageDto,
  RequestAssistanceDto,
  TransitionBookingDto,
} from './dto';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly inspections: InspectionsService,
    private readonly tracking: TrackingService,
  ) {}

  /**
   * Customers create booking requests. Admins may too — the ops team books on
   * behalf of walk-in and phone customers, and a superadmin should be able to
   * do anything either party can.
   */
  @Roles('customer', 'admin')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
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
    return this.bookings.transition(id, userId, role, dto.status, dto.vendor_note, dto.code);
  }

  /**
   * Either party asks Karu to step in. No @Roles gate: the service authorises
   * by ownership, so a customer and a provider can both raise a hand on their
   * own booking and neither can raise one on anybody else's.
   */
  @Post(':id/assistance')
  requestAssistance(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: RequestAssistanceDto,
  ) {
    return this.bookings.requestAssistance(id, userId, role, dto.note);
  }

  /** An admin marks the request handled and it leaves the attention panel. */
  @Roles('admin')
  @Patch(':id/assistance/resolve')
  resolveAssistance(@Param('id') id: string) {
    return this.bookings.resolveAssistance(id);
  }

  // --- condition reports (0030) ---------------------------------------------

  /** Both sides' reports for this booking, with short-lived photo URLs. */
  @Get(':id/inspections')
  listInspections(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.inspections.list(id, userId, role);
  }

  /** Signed upload URL for one condition photo. */
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post(':id/inspections/upload')
  inspectionUpload(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: InspectionUploadDto,
  ) {
    return this.inspections.createPhotoUpload(id, userId, role, dto.file_name);
  }

  /** Record or replace the caller's report for handover or return. */
  @Post(':id/inspections')
  recordInspection(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: RecordInspectionDto,
  ) {
    return this.inspections.record(id, userId, role, dto);
  }

  // --- live tracking of the delivery leg (0035) --------------------------------

  @Get(':id/tracking')
  trackingState(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.tracking.state(id, userId, role);
  }

  @Post(':id/tracking/start')
  trackingStart(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.tracking.start(id, userId, role);
  }

  /** A position every ~10 s while the driver's screen is open. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/tracking')
  trackingUpdate(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: TrackingPointDto,
  ) {
    return this.tracking.update(id, userId, role, dto);
  }

  @Post(':id/tracking/stop')
  trackingStop(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.tracking.stop(id, userId, role);
  }
}
