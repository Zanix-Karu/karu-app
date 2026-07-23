import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Booking } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import {
  renderBookingEmail,
  type BookingEmailTemplate,
  type BookingEmailVars,
} from './templates';

export type BookingEvent = 'requested' | 'confirmed' | 'rejected' | 'cancelled';

/**
 * Sends transactional email via Resend and records every attempt in
 * email_log. Email is best-effort by design: a failed send NEVER fails the
 * booking operation that triggered it — it's logged (status='failed') and can
 * be retried from the log.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  /**
   * Notify the parties of a booking event. Never throws.
   * requested → customer + vendor; confirmed/rejected/cancelled → customer.
   */
  async notifyBookingEvent(booking: Booking, event: BookingEvent): Promise<void> {
    try {
      const [vehicle, vendor, customer] = await Promise.all([
        this.row('vehicles', booking.vehicle_id, 'make, model, year'),
        this.row('vendors', booking.vendor_id, 'contact_email, business_name'),
        this.customerContact(booking.customer_id),
      ]);

      const vars: BookingEmailVars = {
        reference: booking.reference ?? booking.id,
        carName: vehicle
          ? [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ')
          : 'your booking',
        startDate: booking.start_date,
        endDate: booking.end_date,
        totalXaf: booking.total_xaf,
        depositXaf: booking.deposit_xaf,
        pickupLocation: booking.pickup_location,
      };

      const sends: Array<Promise<void>> = [];
      const customerTemplate: BookingEmailTemplate =
        event === 'requested' ? 'booking_requested_customer' : `booking_${event}`;

      if (customer?.email) {
        sends.push(
          this.send(customerTemplate, customer.locale, customer.email, vars, booking.id),
        );
      }
      if (event === 'requested' && typeof vendor?.contact_email === 'string') {
        // Vendors are Cameroon-local; default their mail to French.
        sends.push(
          this.send('booking_requested_vendor', 'fr', vendor.contact_email, vars, booking.id),
        );
      }
      await Promise.all(sends);
    } catch (e) {
      this.logger.warn(`notifyBookingEvent(${event}) failed: ${(e as Error).message}`);
    }
  }

  /** Render, send via Resend, and log the attempt. Never throws. */
  private async send(
    template: BookingEmailTemplate,
    locale: 'en' | 'fr',
    to: string,
    vars: BookingEmailVars,
    bookingId: string,
  ): Promise<void> {
    const { subject, body } = renderBookingEmail(template, locale, vars);
    let providerId: string | null = null;
    let error: string | null = null;

    try {
      const apiKey = this.config.get<string>('RESEND_API_KEY');
      if (!apiKey) throw new Error('RESEND_API_KEY not configured');

      const from = this.config.get<string>('EMAIL_FROM') ?? 'Karu <onboarding@resend.dev>';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, text: body }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      providerId = ((await res.json()) as { id?: string }).id ?? null;
    } catch (e) {
      error = (e as Error).message;
      this.logger.warn(`Email ${template} to ${to} failed: ${error}`);
    }

    await this.supabase.db.from('email_log').insert({
      booking_id: bookingId,
      recipient: to,
      template,
      locale,
      provider_id: providerId,
      status: error ? 'failed' : 'sent',
      error,
    });
  }

  private async row(table: string, id: string, columns: string) {
    const { data } = await this.supabase.db
      .from(table)
      .select(columns)
      .eq('id', id)
      .maybeSingle();
    return data as Record<string, string | number | null> | null;
  }

  /** Email lives in auth.users; locale on the profile. */
  private async customerContact(profileId: string) {
    const [{ data: user }, { data: profile }] = await Promise.all([
      this.supabase.db.auth.admin.getUserById(profileId),
      this.supabase.db.from('profiles').select('locale').eq('id', profileId).maybeSingle(),
    ]);
    if (!user?.user?.email) return null;
    return {
      email: user.user.email,
      locale: (profile?.locale === 'fr' ? 'fr' : 'en') as 'en' | 'fr',
    };
  }
}
