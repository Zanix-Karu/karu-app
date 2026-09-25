import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Booking, BookingStatus, Review, Vehicle } from '@karu/shared';
import { api } from '../lib/api';
import { useView } from '../lib/auth';
import { CATEGORY_LABEL, CITY_LABEL, prettyDate, rentalDays, xaf } from '../lib/format';
import { Badge, Button, Card } from '../ds';
import { ErrorNote, StatusBadge } from '../ui';
import { Skeleton, SkeletonCard } from '../components/Skeleton';
import { useCurrency } from '../lib/currency';
import { ReviewForm } from '../components/ReviewForm';
import { ReceivedReview } from '../components/ReceivedReview';
import { ConfirmButton } from '../components/ConfirmButton';
import { BookingChat } from '../components/BookingChat';

interface BookingDetail extends Booking {
  vehicle: Pick<
    Vehicle,
    'id' | 'make' | 'model' | 'year' | 'category' | 'transmission' | 'seats' | 'photos' | 'city' | 'pickup_locations'
  > | null;
  /** Present for customers and admins; vendors don't need their own details. */
  vendor: { id: string; business_name: string; city: string; contact_phone?: string | null; contact_email?: string | null } | null;
  /** Vendors get display_name only. Admins get the full record. */
  customer: { display_name: string; full_name?: string | null; phone?: string | null; email?: string | null } | null;
}

/** Transitions each view may drive from this screen. Labels are i18n keys. */
const ACTIONS: Record<string, Partial<Record<BookingStatus, Array<{ to: BookingStatus; label: string; danger?: boolean }>>>> = {
  customer: {
    requested: [{ to: 'cancelled', label: 'booking.action.cancelBooking', danger: true }],
    confirmed: [{ to: 'cancelled', label: 'booking.action.cancelBooking', danger: true }],
  },
  vendor: {
    requested: [
      { to: 'confirmed', label: 'booking.action.confirm' },
      { to: 'rejected', label: 'booking.action.reject', danger: true },
    ],
    confirmed: [
      { to: 'in_progress', label: 'booking.action.startTrip' },
      { to: 'cancelled', label: 'booking.action.cancelBooking', danger: true },
    ],
    in_progress: [{ to: 'completed', label: 'booking.action.completeTrip' }],
  },
  admin: {
    requested: [
      { to: 'confirmed', label: 'booking.action.confirm' },
      { to: 'rejected', label: 'booking.action.reject', danger: true },
    ],
    confirmed: [
      { to: 'in_progress', label: 'booking.action.startTrip' },
      { to: 'cancelled', label: 'booking.action.cancelBooking', danger: true },
    ],
    in_progress: [{ to: 'completed', label: 'booking.action.completeTrip' }],
  },
};

/** Days until pick-up — drives the countdown banner. */
function daysUntil(date: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
}

export function BookingDetailScreen() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const view = useView();
  const { secondary } = useCurrency();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['booking-detail', id],
    queryFn: () => api<BookingDetail>(`/bookings/${id}/detail`),
  });

  const transition = useMutation({
    mutationFn: (to: BookingStatus) =>
      api(`/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: to }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['booking-detail', id] });
      void qc.invalidateQueries({ queryKey: ['my-bookings'] });
      void qc.invalidateQueries({ queryKey: ['admin-bookings'] });
      void qc.invalidateQueries({ queryKey: ['vendor-stats'] });
    },
  });

  // The vendor's review of the customer, fetched only once the booking is
  // known to be completed and this is the customer's own view of it.
  const receivedReview = useQuery({
    queryKey: ['reviews-about-me', id],
    queryFn: () => api<Review[]>(`/reviews/about-me?booking_ids=${id}`),
    enabled: view === 'customer' && data?.status === 'completed',
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <Skeleton width={140} height={13} />
        <Skeleton width="55%" height={34} style={{ marginTop: 14 }} />
        <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return <ErrorNote>{(error as Error | undefined)?.message ?? t('booking.notFound')}</ErrorNote>;
  }

  const b = data;
  const days = rentalDays(b.start_date, b.end_date);
  const until = daysUntil(b.start_date);
  const actions = ACTIONS[view]?.[b.status] ?? [];
  const showCountdown =
    b.status === 'confirmed' && until >= 0 && until <= 7;

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 border-b border-karu-ink/10 py-2 text-sm last:border-0">
      <span className="text-karu-mute">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={() => navigate(-1)}
        className="text-sm font-semibold text-karu-brown underline"
      >
        ← {t('common.back')}
      </button>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-karu-mute">{b.reference ?? b.id}</p>
          <h1 className="font-display text-3xl font-bold">
            {b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : t('booking.fallbackTitle')}
            {b.vehicle?.year ? <span className="text-karu-mute"> {b.vehicle.year}</span> : null}
          </h1>
        </div>
        <StatusBadge status={b.status} />
      </div>

      {showCountdown && (
        <div className="mt-4 rounded-xl bg-karu-yellow/20 px-4 py-3 text-sm font-semibold text-karu-brown">
          {until === 0 ? t('booking.pickupToday') : t('booking.pickupInDays', { count: until })}
        </div>
      )}
      {b.status === 'in_progress' && (
        <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
          {t('booking.tripInProgress', { date: prettyDate(b.end_date) })}
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-bold">{t('booking.trip')}</h2>
          <div className="mt-2">
            {row(t('booking.pickupDate'), prettyDate(b.start_date))}
            {row(t('booking.returnDate'), prettyDate(b.end_date))}
            {row(t('booking.duration'), t('common.day', { count: days }))}
            {row(
              t('booking.collection'),
              b.delivery_type === 'airport'
                ? `${t('booking.airportMeet')}${b.delivery_address ? ` · ${b.delivery_address}` : ''}`
                : b.delivery_type === 'address'
                  ? `${t('booking.deliveryLabel')} · ${b.delivery_address}`
                  : (b.pickup_location ?? t('booking.toBeArranged')),
            )}
            {b.pickup_time ? row(t('booking.time'), b.pickup_time.slice(0, 5)) : null}
            {row(t('booking.driverLabel'), b.with_driver ? t('booking.withDriver') : t('booking.selfDrive'))}
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-bold">{t('booking.price')}</h2>
          <div className="mt-2">
            {row(t('booking.dailyRate'), xaf(b.daily_rate_xaf))}
            {/* The vehicle line is the total less the extras — with a driver
                or a delivery, days x daily rate is no longer the total. */}
            {row(
              t('common.day', { count: days }),
              xaf(b.total_xaf - b.driver_fee_xaf - b.delivery_fee_xaf),
            )}
            {b.driver_fee_xaf > 0 ? row(t('booking.driverLabel'), xaf(b.driver_fee_xaf)) : null}
            {b.delivery_fee_xaf > 0
              ? row(
                  b.delivery_type === 'airport' ? t('booking.airportMeet') : t('booking.deliveryLabel'),
                  xaf(b.delivery_fee_xaf),
                )
              : null}
            {row(
              t('booking.total'),
              <>
                {xaf(b.total_xaf)}
                {secondary(b.total_xaf) && (
                  <span className="ml-1 font-normal text-karu-mute">({secondary(b.total_xaf)})</span>
                )}
              </>,
            )}
            {b.deposit_xaf ? row(t('booking.depositPercent'), xaf(b.deposit_xaf)) : null}
          </div>
          <DepositBlock bookingId={b.id} view={view} />
        </Card>

        {/* Provider — shown to customers and admins. */}
        {b.vendor && (
          <Card>
            <h2 className="font-display text-lg font-bold">{t('booking.provider')}</h2>
            <div className="mt-2">
              {row(
                t('booking.business'),
                <Link to={`/vendors/${b.vendor.id}`} className="underline">
                  {b.vendor.business_name}
                </Link>,
              )}
              {row(t('booking.city'), CITY_LABEL[b.vendor.city] ?? b.vendor.city)}
              {b.vendor.contact_phone ? row(t('booking.phone'), b.vendor.contact_phone) : null}
              {b.vendor.contact_email ? row(t('auth.email'), b.vendor.contact_email) : null}
            </div>
          </Card>
        )}

        {/* Customer — vendors get a display name only; admins get everything. */}
        {b.customer && (
          <Card>
            <h2 className="font-display text-lg font-bold">{t('booking.customer')}</h2>
            <div className="mt-2">
              {row(t('booking.name'), b.customer.display_name)}
              {b.customer.phone ? row(t('booking.phone'), b.customer.phone) : null}
              {b.customer.email ? row(t('auth.email'), b.customer.email) : null}
            </div>
            {view === 'vendor' && (
              <p className="mt-3 text-xs text-karu-mute">{t('booking.contactPrivate')}</p>
            )}
          </Card>
        )}

        {b.vehicle && (
          <Card>
            <h2 className="font-display text-lg font-bold">{t('booking.vehicle')}</h2>
            <div className="mt-2">
              {row(t('booking.category'), CATEGORY_LABEL[b.vehicle.category] ?? b.vehicle.category)}
              {row(t('booking.gearbox'), b.vehicle.transmission === 'automatic' ? t('common.automatic') : t('common.manual'))}
              {b.vehicle.seats ? row(t('booking.seats'), b.vehicle.seats) : null}
              {row(t('booking.city'), CITY_LABEL[b.vehicle.city] ?? b.vehicle.city)}
            </div>
            <Link
              to={`/cars/${b.vehicle.id}`}
              className="mt-3 inline-block text-sm font-semibold text-karu-brown underline"
            >
              {t('booking.viewListing')}
            </Link>
          </Card>
        )}

        {b.customer_note && (
          <Card>
            <h2 className="font-display text-lg font-bold">{t('booking.customerNote')}</h2>
            <p className="mt-2 text-sm">&ldquo;{b.customer_note}&rdquo;</p>
          </Card>
        )}
      </div>

      {actions.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <h2 className="font-display text-lg font-bold">{t('booking.actions')}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((a) =>
              a.danger ? (
                <ConfirmButton
                  key={a.to}
                  as={Button}
                  variant="danger"
                  loading={transition.isPending}
                  confirmLabel={`${t(a.label)}?`}
                  onConfirm={() => transition.mutate(a.to)}
                >
                  {t(a.label)}
                </ConfirmButton>
              ) : (
                <Button
                  key={a.to}
                  variant="primary"
                  disabled={transition.isPending}
                  onClick={() => transition.mutate(a.to)}
                >
                  {transition.isPending ? t('common.oneMoment') : t(a.label)}
                </Button>
              ),
            )}
          </div>
          {transition.isError && (
            <div className="mt-3">
              <ErrorNote>{(transition.error as Error).message}</ErrorNote>
            </div>
          )}
        </Card>
      )}

      {view === 'admin' && <RecordDeposit bookingId={b.id} />}

      <BookingChat
        bookingId={b.id}
        view={view}
        assistanceOpen={Boolean(b.assistance_requested_at && !b.assistance_resolved_at)}
      />

      {b.status === 'completed' && view !== 'admin' && (
        <div className="mt-4">
          <ReviewForm
            bookingId={b.id}
            prompt={view === 'vendor' ? t('review.rateCustomer') : t('review.ratePrompt')}
          />
        </div>
      )}

      {view === 'customer' && receivedReview.data && receivedReview.data.length > 0 && (
        <ReceivedReview review={receivedReview.data[0]} />
      )}

      <div className="mt-6 flex items-center gap-2 text-xs text-karu-mute">
        <Badge variant="neutral">{t('booking.requestedOn', { date: prettyDate(b.requested_at.slice(0, 10)) })}</Badge>
        {b.confirmed_at && (
          <Badge variant="success">{t('booking.confirmedOn', { date: prettyDate(b.confirmed_at.slice(0, 10)) })}</Badge>
        )}
      </div>
    </div>
  );
}

/** Status wording that never overstates what actually happened. Labels are i18n keys. */
const PAYMENT_COPY: Record<string, { label: string; tone: 'neutral' | 'success' | 'danger' }> = {
  pending: { label: 'booking.depositNotPaid', tone: 'neutral' },
  held: { label: 'booking.depositReceived', tone: 'success' },
  released: { label: 'booking.depositReleased', tone: 'success' },
  refunded: { label: 'booking.depositRefunded', tone: 'neutral' },
  failed: { label: 'booking.depositFailed', tone: 'danger' },
};

/**
 * The deposit, told truthfully. While the provider is the manual placeholder
 * there is no "Pay now" and no Paid badge — a booking only shows as paid once
 * an admin records that the team actually received the money.
 */
function DepositBlock({ bookingId, view }: { bookingId: string; view: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['payment', bookingId],
    queryFn: () =>
      api<{ payment: { status: string; amount_xaf: number } | null; chargingEnabled: boolean }>(
        `/bookings/${bookingId}/payment`,
      ),
  });

  const start = useMutation({
    mutationFn: () =>
      api<{ instructions: string; redirectUrl: string | null }>(
        `/bookings/${bookingId}/payment/intent`,
        { method: 'POST' },
      ),
    onSuccess: (r) => {
      if (r.redirectUrl) window.location.href = r.redirectUrl;
      else void qc.invalidateQueries({ queryKey: ['payment', bookingId] });
    },
  });

  const status = data?.payment?.status;
  const copy = status ? PAYMENT_COPY[status] : null;

  return (
    <div className="mt-3 border-t border-karu-ink/10 pt-3">
      {copy ? (
        <p
          className={`text-xs font-semibold ${
            copy.tone === 'success'
              ? 'text-green-700'
              : copy.tone === 'danger'
                ? 'text-karu-terracotta'
                : 'text-karu-mute'
          }`}
        >
          {t(copy.label)}
        </p>
      ) : (
        <p className="text-xs text-karu-mute">{t('booking.noDeposit')}</p>
      )}

      {!data?.chargingEnabled && (
        <p className="mt-1 text-xs text-karu-mute">{t('booking.chargingOff')}</p>
      )}

      {view === 'customer' && status !== 'held' && status !== 'released' && (
        <>
          <Button
            variant="outline"
            className="mt-3"
            loading={start.isPending}
            onClick={() => start.mutate()}
          >
            {t('booking.howToPay')}
          </Button>
          {start.isSuccess && (
            <p className="mt-2 text-xs text-karu-brown">{start.data?.instructions}</p>
          )}
          {start.isError && (
            <div className="mt-2">
              <ErrorNote>{(start.error as Error).message}</ErrorNote>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Admin-only reconciliation. Deposits are collected off-platform while the
 * provider is manual, so a human records what was actually received — the
 * system never infers it.
 */
function RecordDeposit({ bookingId }: { bookingId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<'held' | 'released' | 'refunded' | 'failed'>('held');
  const [reference, setReference] = useState('');

  const record = useMutation({
    mutationFn: () =>
      api(`/admin/bookings/${bookingId}/payment`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reference: reference.trim() || undefined }),
      }),
    onSuccess: () => {
      setReference('');
      void qc.invalidateQueries({ queryKey: ['payment', bookingId] });
    },
  });

  return (
    <Card style={{ marginTop: 16 }}>
      <h2 className="font-display text-lg font-bold">{t('booking.recordDeposit.title')}</h2>
      <p className="mt-1 text-sm text-karu-mute">{t('booking.recordDeposit.sub')}</p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          record.mutate();
        }}
      >
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-karu-mute">
            {t('booking.recordDeposit.status')}
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="rounded-lg border border-karu-ink/15 px-3 py-2 text-sm"
          >
            <option value="held">{t('booking.recordDeposit.statusHeld')}</option>
            <option value="released">{t('booking.recordDeposit.statusReleased')}</option>
            <option value="refunded">{t('booking.recordDeposit.statusRefunded')}</option>
            <option value="failed">{t('booking.recordDeposit.statusFailed')}</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-karu-mute">
            {t('booking.recordDeposit.reference')}
          </span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={t('booking.recordDeposit.referencePlaceholder')}
            className="rounded-lg border border-karu-ink/15 px-3 py-2 text-sm"
          />
        </label>
        <Button type="submit" loading={record.isPending}>
          {t('booking.recordDeposit.submit')}
        </Button>
      </form>
      {record.isSuccess && (
        <p className="mt-2 text-sm font-semibold text-green-700">{t('booking.recordDeposit.recorded')}</p>
      )}
      {record.isError && (
        <div className="mt-2">
          <ErrorNote>{(record.error as Error).message}</ErrorNote>
        </div>
      )}
    </Card>
  );
}
