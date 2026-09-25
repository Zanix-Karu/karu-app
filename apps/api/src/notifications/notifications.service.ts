import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Booking, Vendor } from '@karu/shared';
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

  /**
   * Nudge the other party of a booking that a chat message is waiting.
   *
   * Chat lives in the app; email is only the doorbell. Throttled to one mail
   * per recipient per booking per hour (checked against email_log) so a
   * back-and-forth conversation doesn't turn into an inbox flood. Best-effort
   * like all mail here — a failed send never fails the message.
   */
  async notifyChatMessage(params: {
    booking: Booking;
    recipients: Array<{ email: string; locale: 'en' | 'fr' }>;
    preview: string;
  }): Promise<void> {
    const { booking, preview } = params;
    const base = (this.config.get<string>('WEB_APP_URL') ?? 'https://app.getkaru.io').replace(/\/$/, '');
    const ref = booking.reference ?? booking.id;

    for (const { email, locale } of params.recipients) {
      try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recent } = await this.supabase.db
          .from('email_log')
          .select('id')
          .eq('booking_id', booking.id)
          .eq('recipient', email)
          .eq('template', 'chat_message_notice')
          .eq('status', 'sent')
          .gte('created_at', oneHourAgo)
          .limit(1);
        if (recent && recent.length > 0) continue;

        const subject =
          locale === 'fr'
            ? `Karu — nouveau message concernant ${ref}`
            : `Karu — new message about ${ref}`;
        const body =
          locale === 'fr'
            ? `Vous avez un nouveau message concernant la réservation ${ref} :\n\n« ${preview} »\n\nRépondez dans l'application : ${base}/bookings/${booking.id}\n\nToute la communication passe par Karu — merci de ne pas partager de coordonnées.`
            : `You have a new message about booking ${ref}:\n\n"${preview}"\n\nReply in the app: ${base}/bookings/${booking.id}\n\nAll communication runs through Karu — please don't share contact details.`;

        let providerId: string | null = null;
        let error: string | null = null;
        try {
          const apiKey = this.config.get<string>('RESEND_API_KEY');
          if (!apiKey) throw new Error('RESEND_API_KEY not configured');
          const from = this.config.get<string>('EMAIL_FROM') ?? 'Karu <onboarding@resend.dev>';
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to: email, subject, text: body }),
          });
          if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
          providerId = ((await res.json()) as { id?: string }).id ?? null;
        } catch (e) {
          error = (e as Error).message;
          this.logger.warn(`Chat notice for ${booking.id} to ${email} failed: ${error}`);
        }

        await this.supabase.db.from('email_log').insert({
          booking_id: booking.id,
          recipient: email,
          template: 'chat_message_notice',
          locale,
          provider_id: providerId,
          status: error ? 'failed' : 'sent',
          error,
        });
      } catch (e) {
        this.logger.warn(`notifyChatMessage(${booking.id}) failed: ${(e as Error).message}`);
      }
    }
  }

  /**
   * REQ-9: tell a vendor why their account was suspended, or that it was
   * reinstated. Vendors are Cameroon-local (see notifyBookingEvent above),
   * so this defaults to French like every other vendor-facing mail here.
   * Best-effort like every send in this file — never throws.
   */
  async notifyVendorSuspended(vendor: Vendor, reason: string): Promise<void> {
    if (!vendor.contact_email) return;
    await this.sendPlain({
      to: vendor.contact_email,
      locale: 'fr',
      subject: 'Karu — votre compte prestataire a été suspendu',
      body: [
        `Bonjour,`,
        ``,
        `Votre compte prestataire Karu (${vendor.business_name}) a été suspendu.`,
        `Motif : ${reason}`,
        ``,
        `Tant que la suspension est en vigueur, vos annonces ne sont plus visibles et vous ne pouvez pas recevoir de nouvelles demandes de réservation. Si vous pensez qu'il s'agit d'une erreur, contactez l'équipe Karu.`,
      ].join('\n'),
      template: 'vendor_suspended',
      bookingId: null,
    });
  }

  async notifyVendorReinstated(vendor: Vendor): Promise<void> {
    if (!vendor.contact_email) return;
    await this.sendPlain({
      to: vendor.contact_email,
      locale: 'fr',
      subject: 'Karu — votre compte prestataire a été réactivé',
      body: [
        `Bonjour,`,
        ``,
        `Bonne nouvelle : votre compte prestataire Karu (${vendor.business_name}) a été réactivé. Vos annonces sont de nouveau visibles et vous pouvez recevoir des demandes de réservation.`,
      ].join('\n'),
      template: 'vendor_reinstated',
      bookingId: null,
    });
  }

  /**
   * A customer holding a standing (confirmed/in_progress) booking under a
   * vendor that just got suspended deserves to know something changed —
   * without us claiming the booking is cancelled, since ops still decides
   * that case-by-case (see AdminService.setVendorStatus). A transparency
   * notice, not an alarm.
   */
  async notifyCustomerVendorUnderReview(booking: Booking): Promise<void> {
    try {
      const [vehicle, customer] = await Promise.all([
        this.row('vehicles', booking.vehicle_id, 'make, model, year'),
        this.customerContact(booking.customer_id),
      ]);
      if (!customer?.email) return;
      const carName = vehicle
        ? [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ')
        : 'your booking';
      const ref = booking.reference ?? booking.id;
      const subject =
        customer.locale === 'fr'
          ? `Karu — une mise à jour concernant votre réservation ${ref}`
          : `Karu — an update about your booking ${ref}`;
      const body =
        customer.locale === 'fr'
          ? `Nous vous informons que le prestataire de votre réservation ${ref} (${carName}) fait actuellement l'objet d'une vérification par notre équipe. Votre réservation reste en vigueur pour le moment — nous vous recontacterons si quoi que ce soit doit changer.`
          : `We're letting you know that the provider for your booking ${ref} (${carName}) is currently under review by our team. Your booking stands for now — we'll reach out if anything needs to change.`;
      await this.sendPlain({
        to: customer.email,
        locale: customer.locale,
        subject,
        body,
        template: 'vendor_suspended_customer_notice',
        bookingId: booking.id,
      });
    } catch (e) {
      this.logger.warn(`notifyCustomerVendorUnderReview(${booking.id}) failed: ${(e as Error).message}`);
    }
  }

  /** Render, send via Resend, and log the attempt. Never throws. */
  /**
   * Relay a message about a booking to the Karu team.
   *
   * Customer contact details never reach vendors (marketplace spec), and
   * in-app chat is explicitly deferred in the MVP plan — so the team is the
   * channel. This records who asked, about which booking, and what they said,
   * then emails the support address. Logged like any other mail, so a failed
   * send is visible rather than silent.
   */
  async relayBookingMessage(params: {
    bookingId: string;
    reference: string | null;
    fromRole: string;
    fromEmail: string | null;
    message: string;
  }): Promise<{ delivered: boolean }> {
    const to = this.config.get<string>('SUPPORT_EMAIL') ?? 'support@getkaru.io';
    const subject = `Karu — message about ${params.reference ?? params.bookingId}`;
    const body = [
      `A ${params.fromRole} sent a message about booking ${params.reference ?? params.bookingId}.`,
      params.fromEmail ? `Reply to: ${params.fromEmail}` : 'No reply address on file.',
      '',
      params.message,
    ].join('\n');

    let providerId: string | null = null;
    let error: string | null = null;
    try {
      const apiKey = this.config.get<string>('RESEND_API_KEY');
      if (!apiKey) throw new Error('RESEND_API_KEY not configured');
      const from = this.config.get<string>('EMAIL_FROM') ?? 'Karu <onboarding@resend.dev>';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, text: body, reply_to: params.fromEmail ?? undefined }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      providerId = ((await res.json()) as { id?: string }).id ?? null;
    } catch (e) {
      error = (e as Error).message;
      this.logger.warn(`Relay for ${params.bookingId} failed: ${error}`);
    }

    await this.supabase.db.from('email_log').insert({
      booking_id: params.bookingId,
      recipient: to,
      template: 'booking_message_relay',
      locale: 'en',
      provider_id: providerId,
      status: error ? 'failed' : 'sent',
      error,
    });

    return { delivered: !error };
  }

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

  /**
   * Same send-via-Resend-and-log contract as `send()` above, for mail that
   * isn't one of the structured BookingEmailTemplate/BookingEmailVars pairs
   * (vendor status changes aren't about a car or a booking's dates). Plain
   * subject/body instead of a template key.
   */
  private async sendPlain(params: {
    to: string;
    locale: 'en' | 'fr';
    subject: string;
    body: string;
    template: string;
    bookingId: string | null;
  }): Promise<void> {
    let providerId: string | null = null;
    let error: string | null = null;

    try {
      const apiKey = this.config.get<string>('RESEND_API_KEY');
      if (!apiKey) throw new Error('RESEND_API_KEY not configured');

      const from = this.config.get<string>('EMAIL_FROM') ?? 'Karu <onboarding@resend.dev>';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: params.to, subject: params.subject, text: params.body }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      providerId = ((await res.json()) as { id?: string }).id ?? null;
    } catch (e) {
      error = (e as Error).message;
      this.logger.warn(`Email ${params.template} to ${params.to} failed: ${error}`);
    }

    await this.supabase.db.from('email_log').insert({
      booking_id: params.bookingId,
      recipient: params.to,
      template: params.template,
      locale: params.locale,
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
