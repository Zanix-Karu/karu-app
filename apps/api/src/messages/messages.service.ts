import { BadRequestException, Injectable } from '@nestjs/common';
import type { Booking, BookingMessage, UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { BookingsService } from '../bookings/bookings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { redactContactDetails } from './redact';

/**
 * In-app chat between the parties of a booking.
 *
 * Access rides on BookingsService.getForUser — exactly the people who may see
 * a booking may read and write its thread: the customer, the owning vendor,
 * and admins. Admin intervention is structural, not bolted on: every thread
 * is visible from the admin console, admin messages appear as Karu Support,
 * and contact details are stripped from non-admin messages before storage so
 * the platform's contact-isolation rule holds inside chat too.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly bookings: BookingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The thread, oldest first. Opening it moves the caller's read cursor. */
  async list(bookingId: string, userId: string, role: UserRole): Promise<BookingMessage[]> {
    await this.bookings.getForUser(bookingId, userId, role);

    const { data, error } = await this.supabase.db
      .from('booking_messages')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });
    if (error) throw new BadRequestException(error.message);

    // Cursor, not per-message flags: "read" means "opened the thread".
    await this.supabase.db
      .from('booking_message_reads')
      .upsert({ booking_id: bookingId, profile_id: userId, last_read_at: new Date().toISOString() });

    return (data ?? []) as BookingMessage[];
  }

  /**
   * Post to the thread. Non-admin text passes through contact redaction
   * first; the stored row's `redacted` flag tells the sender it happened.
   * The other party gets a throttled email nudge, best-effort.
   */
  async send(
    bookingId: string,
    userId: string,
    role: UserRole,
    rawBody: string,
  ): Promise<BookingMessage> {
    const booking = await this.bookings.getForUser(bookingId, userId, role);

    const trimmed = rawBody.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');

    const { text, redacted } =
      role === 'admin' ? { text: trimmed, redacted: false } : redactContactDetails(trimmed);

    const { data, error } = await this.supabase.db
      .from('booking_messages')
      .insert({
        booking_id: bookingId,
        sender_id: userId,
        sender_role: role,
        body: text,
        redacted,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Could not send message');
    }
    const message = data as BookingMessage;

    // Sending posted the message; a failed nudge must never undo that.
    try {
      const recipients = await this.recipientsFor(booking, role);
      if (recipients.length > 0) {
        await this.notifications.notifyChatMessage({
          booking,
          recipients,
          preview: text.length > 200 ? `${text.slice(0, 200)}…` : text,
        });
      }
    } catch {
      // Already logged inside notifications; nothing more to do.
    }

    return message;
  }

  /**
   * Every conversation, newest activity first — the admin oversight surface.
   * One row per booking that has messages: who is talking, the latest
   * message, and how much this admin hasn't read yet.
   */
  async adminConversations(adminId: string) {
    const { data, error } = await this.supabase.db
      .from('booking_messages')
      .select('booking_id, sender_role, body, redacted, created_at')
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    const messages = (data ?? []) as Array<
      Pick<BookingMessage, 'booking_id' | 'sender_role' | 'body' | 'redacted' | 'created_at'>
    >;
    if (messages.length === 0) return [];

    const byBooking = new Map<string, typeof messages>();
    for (const m of messages) {
      const list = byBooking.get(m.booking_id) ?? [];
      list.push(m);
      byBooking.set(m.booking_id, list);
    }
    const bookingIds = [...byBooking.keys()];

    const [bookingsRes, readsRes] = await Promise.all([
      this.supabase.db
        .from('bookings')
        .select('id, reference, status, customer_id, vendor_id')
        .in('id', bookingIds),
      this.supabase.db
        .from('booking_message_reads')
        .select('booking_id, last_read_at')
        .eq('profile_id', adminId)
        .in('booking_id', bookingIds),
    ]);
    const bookingRows = (bookingsRes.data ?? []) as Array<{
      id: string;
      reference: string | null;
      status: string;
      customer_id: string;
      vendor_id: string;
    }>;
    const lastReadAt = new Map(
      ((readsRes.data ?? []) as Array<{ booking_id: string; last_read_at: string }>).map((r) => [
        r.booking_id,
        r.last_read_at,
      ]),
    );

    // Names for the row labels — one query per side, not per conversation.
    const [customersRes, vendorsRes] = await Promise.all([
      this.supabase.db
        .from('profiles')
        .select('id, full_name')
        .in('id', [...new Set(bookingRows.map((b) => b.customer_id))]),
      this.supabase.db
        .from('vendors')
        .select('id, business_name')
        .in('id', [...new Set(bookingRows.map((b) => b.vendor_id))]),
    ]);
    const customerName = new Map(
      ((customersRes.data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [
        p.id,
        p.full_name,
      ]),
    );
    const vendorName = new Map(
      ((vendorsRes.data ?? []) as Array<{ id: string; business_name: string }>).map((v) => [
        v.id,
        v.business_name,
      ]),
    );

    return bookingRows
      .map((b) => {
        const thread = byBooking.get(b.id) ?? [];
        const latest = thread[0]; // thread is newest-first
        const cursor = lastReadAt.get(b.id);
        return {
          booking_id: b.id,
          reference: b.reference,
          booking_status: b.status,
          customer_name: customerName.get(b.customer_id) ?? 'Customer',
          vendor_name: vendorName.get(b.vendor_id) ?? 'Provider',
          message_count: thread.length,
          unread_count: cursor
            ? thread.filter((m) => m.created_at > cursor).length
            : thread.length,
          /** True when any message in the thread had contact details removed. */
          any_redacted: thread.some((m) => m.redacted),
          last_message: latest
            ? { sender_role: latest.sender_role, body: latest.body, created_at: latest.created_at }
            : null,
        };
      })
      .sort((a, b) =>
        (b.last_message?.created_at ?? '').localeCompare(a.last_message?.created_at ?? ''),
      );
  }

  /** Who to nudge: the parties other than the sender. */
  private async recipientsFor(
    booking: Booking,
    senderRole: UserRole,
  ): Promise<Array<{ email: string; locale: 'en' | 'fr' }>> {
    const recipients: Array<{ email: string; locale: 'en' | 'fr' }> = [];

    if (senderRole !== 'vendor') {
      // Vendors are Cameroon-local; their mail defaults to French (as in
      // booking notifications).
      const { data: vendor } = await this.supabase.db
        .from('vendors')
        .select('contact_email')
        .eq('id', booking.vendor_id)
        .maybeSingle();
      if (vendor?.contact_email) recipients.push({ email: vendor.contact_email, locale: 'fr' });
    }

    if (senderRole !== 'customer') {
      const [{ data: user }, { data: profile }] = await Promise.all([
        this.supabase.db.auth.admin.getUserById(booking.customer_id),
        this.supabase.db.from('profiles').select('locale').eq('id', booking.customer_id).maybeSingle(),
      ]);
      if (user?.user?.email) {
        recipients.push({
          email: user.user.email,
          locale: profile?.locale === 'fr' ? 'fr' : 'en',
        });
      }
    }

    return recipients;
  }
}
