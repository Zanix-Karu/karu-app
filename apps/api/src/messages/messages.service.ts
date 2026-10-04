import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Booking, BookingMessage, UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { dbErrorMessage } from '../supabase/db-error';
import { BookingsService } from '../bookings/bookings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { offPlatformFlags, redactContactDetails } from './redact';
import {
  DeepLProvider,
  NullTranslationProvider,
  guessLanguage,
  type TranslationProvider,
} from '../reviews/translation';

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
  /** Same engine as reviews: a DeepL key turns it on, none hides the control. */
  private readonly translator: TranslationProvider;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly bookings: BookingsService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    const key = config.get<string>('DEEPL_API_KEY');
    this.translator = key ? new DeepLProvider({ apiKey: key }) : new NullTranslationProvider();
  }

  get canTranslate(): boolean {
    return this.translator.canTranslate;
  }

  /**
   * "See translation" on one chat message (0031), cached per target language.
   *
   * What gets translated is the stored body, which for a non-admin sender is
   * already redacted, so a translation can never put back a phone number the
   * redaction took out. Access rides on the booking, like the thread itself.
   */
  async translation(bookingId: string, messageId: string, userId: string, role: UserRole, target: 'en' | 'fr') {
    await this.bookings.getForUser(bookingId, userId, role);
    if (!this.translator.canTranslate) {
      throw new BadRequestException('Translation is not available');
    }

    const { data: row } = await this.supabase.db
      .from('booking_messages')
      .select('id, booking_id, body, language')
      .eq('id', messageId)
      .eq('booking_id', bookingId)
      .maybeSingle();
    const message = row as { body: string; language: 'en' | 'fr' | null } | null;
    if (!message) throw new NotFoundException('Message not found');

    const source = message.language ?? guessLanguage(message.body);
    if (source === target) return { body: message.body, cached: false };

    const { data: cached } = await this.supabase.db
      .from('booking_message_translations')
      .select('body')
      .eq('message_id', messageId)
      .eq('target_lang', target)
      .maybeSingle();
    if (cached) return { body: (cached as { body: string }).body, cached: true };

    const body = await this.translator.translate(message.body, target);
    // Best-effort cache: a failed write costs a re-translation, not the reply.
    await this.supabase.db
      .from('booking_message_translations')
      .insert({ message_id: messageId, target_lang: target, body, provider: this.translator.name });
    return { body, cached: false };
  }

  /** The thread, oldest first. Opening it moves the caller's read cursor. */
  async list(bookingId: string, userId: string, role: UserRole): Promise<BookingMessage[]> {
    await this.bookings.getForUser(bookingId, userId, role);

    const { data, error } = await this.supabase.db
      .from('booking_messages')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not load messages'));

    // Cursor, not per-message flags: "read" means "opened the thread".
    await this.supabase.db
      .from('booking_message_reads')
      .upsert({ booking_id: bookingId, profile_id: userId, last_read_at: new Date().toISOString() });

    const messages = (data ?? []) as BookingMessage[];
    // Flags are an admin signal; a party seeing "flagged" on their own
    // message would only teach them which words to avoid.
    return role === 'admin' ? messages : messages.map(({ flags: _flags, ...m }) => m);
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
    // Read off the original, not the redacted text: "call me on [hidden]"
    // is exactly the sentence worth flagging.
    const flags = role === 'admin' ? [] : offPlatformFlags(trimmed);

    // 0031: the sender's interface language, so the reader is only offered a
    // translation when it differs from theirs.
    const { data: senderProfile } = await this.supabase.db
      .from('profiles')
      .select('locale')
      .eq('id', userId)
      .maybeSingle();
    const senderLocale = (senderProfile as { locale?: string } | null)?.locale;
    const language = role !== 'admin' && (senderLocale === 'en' || senderLocale === 'fr') ? senderLocale : null;

    const { data, error } = await this.supabase.db
      .from('booking_messages')
      .insert({
        booking_id: bookingId,
        sender_id: userId,
        sender_role: role,
        body: text,
        redacted,
        flags,
        language,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new BadRequestException(dbErrorMessage(error, 'Could not send message'));
    }
    const { flags: _flags, ...message } = data as BookingMessage;

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
      .select('booking_id, sender_role, body, redacted, flags, created_at')
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not load conversations'));
    const messages = (data ?? []) as Array<
      Pick<BookingMessage, 'booking_id' | 'sender_role' | 'body' | 'redacted' | 'flags' | 'created_at'>
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
          /** Distinct off-platform flags raised anywhere in the thread (0030). */
          flags: [...new Set(thread.flatMap((m) => m.flags ?? []))],
          last_message: latest
            ? { sender_role: latest.sender_role, body: latest.body, created_at: latest.created_at }
            : null,
        };
      })
      .sort((a, b) =>
        (b.last_message?.created_at ?? '').localeCompare(a.last_message?.created_at ?? ''),
      );
  }

  /**
   * The provider's own threads, same shape as the admin feed but scoped to
   * their bookings. Feeds the attention panel on their dashboard: until now a
   * provider had no way to see that a customer had written to them without
   * opening each booking in turn.
   */
  async vendorConversations(profileId: string) {
    const { data: vendorRow } = await this.supabase.db
      .from('vendors')
      .select('id')
      .eq('profile_id', profileId)
      .maybeSingle();
    if (!vendorRow) return [];
    const vendorId = (vendorRow as { id: string }).id;

    const { data: bookingRows, error: bookingErr } = await this.supabase.db
      .from('bookings')
      .select('id, reference, status, customer_id, assistance_requested_at, assistance_resolved_at')
      .eq('vendor_id', vendorId);
    if (bookingErr) throw new BadRequestException(bookingErr.message);

    const bookings = (bookingRows ?? []) as Array<{
      id: string;
      reference: string | null;
      status: string;
      customer_id: string;
      assistance_requested_at: string | null;
      assistance_resolved_at: string | null;
    }>;
    if (bookings.length === 0) return [];
    const bookingIds = bookings.map((b) => b.id);

    const [messagesRes, readsRes, customersRes] = await Promise.all([
      this.supabase.db
        .from('booking_messages')
        .select('booking_id, sender_role, body, created_at')
        .in('booking_id', bookingIds)
        .order('created_at', { ascending: false }),
      this.supabase.db
        .from('booking_message_reads')
        .select('booking_id, last_read_at')
        .eq('profile_id', profileId)
        .in('booking_id', bookingIds),
      this.supabase.db
        .from('profiles')
        .select('id, full_name')
        .in('id', [...new Set(bookings.map((b) => b.customer_id))]),
    ]);

    const messages = (messagesRes.data ?? []) as Array<{
      booking_id: string;
      sender_role: string;
      body: string;
      created_at: string;
    }>;
    const byBooking = new Map<string, typeof messages>();
    for (const m of messages) {
      const list = byBooking.get(m.booking_id) ?? [];
      list.push(m);
      byBooking.set(m.booking_id, list);
    }
    const lastReadAt = new Map(
      ((readsRes.data ?? []) as Array<{ booking_id: string; last_read_at: string }>).map((r) => [
        r.booking_id,
        r.last_read_at,
      ]),
    );
    const customerName = new Map(
      ((customersRes.data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [
        p.id,
        p.full_name,
      ]),
    );

    return bookings
      .map((b) => {
        const thread = byBooking.get(b.id) ?? [];
        const cursor = lastReadAt.get(b.id);
        const unseen = cursor
          ? thread.filter((m) => m.created_at > cursor)
          : thread;
        return {
          booking_id: b.id,
          reference: b.reference,
          booking_status: b.status,
          customer_name: customerName.get(b.customer_id) ?? 'Customer',
          message_count: thread.length,
          // Only the other side's messages count as unread: a provider has by
          // definition read their own.
          unread_count: unseen.filter((m) => m.sender_role !== 'vendor').length,
          assistance_open: Boolean(b.assistance_requested_at && !b.assistance_resolved_at),
          last_message: thread[0]
            ? { sender_role: thread[0].sender_role, body: thread[0].body, created_at: thread[0].created_at }
            : null,
        };
      })
      .filter((c) => c.message_count > 0)
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
