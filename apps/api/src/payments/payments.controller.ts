import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '@karu/shared';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { PaymentsService } from './payments.service';
import { RecordPaymentDto } from './dto';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Begin the deposit for a booking. Idempotent per booking. */
  @Post('bookings/:id/payment/intent')
  intent(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.payments.createDepositIntent(id, userId, role);
  }

  /** Current deposit state, for anyone who may see the booking. */
  @Get('bookings/:id/payment')
  state(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.payments.forBooking(id, userId, role);
  }

  /**
   * Record a deposit the team took off-platform. Deliberately an explicit
   * admin action: while payments are manual, nothing may be marked received
   * without a human confirming it.
   */
  @Roles('admin')
  @Patch('admin/bookings/:id/payment')
  record(@Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.payments.recordManualStatus(id, dto.status, dto.reference);
  }

  /**
   * Provider callback. Public by necessity, but the adapter verifies the
   * signature — with no provider configured every call is refused.
   */
  @Public()
  @Post('payments/webhook')
  webhook(@Req() req: Request, @Headers() headers: Record<string, string | undefined>) {
    const raw = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    return this.payments.handleWebhook(raw, headers);
  }
}
