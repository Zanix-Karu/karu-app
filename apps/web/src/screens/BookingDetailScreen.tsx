import { useState } from 'react';
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

interface Action {
  to: BookingStatus;
  label: string;
  danger?: boolean;
  /**
   * REQ-6: a vendor driving this transition must read the code back from the
   * customer rather than just clicking through — admin's identical-looking
   * action is left without this flag, since admin keeps the override it
   * already has everywhere else (ops/dispute resolution).
   */
  needsCode?: boolean;
}

/** Transitions each view may drive from this screen. */
const ACTIONS: Record<string, Partial<Record<BookingStatus, Action[]>>> = {
  customer: {
    requested: [{ to: 'cancelled', label: 'Cancel booking', danger: true }],
    confirmed: [{ to: 'cancelled', label: 'Cancel booking', danger: true }],
  },
  vendor: {
    requested: [
      { to: 'confirmed', label: 'Confirm' },
      { to: 'rejected', label: 'Reject', danger: true },
    ],
    confirmed: [
      { to: 'in_progress', label: 'Start trip', needsCode: true },
      { to: 'cancelled', label: 'Cancel booking', danger: true },
    ],
    in_progress: [{ to: 'completed', label: 'Complete trip', needsCode: true }],
  },
  admin: {
    requested: [
      { to: 'confirmed', label: 'Confirm' },
      { to: 'rejected', label: 'Reject', danger: true },
    ],
    confirmed: [
      { to: 'in_progress', label: 'Start trip' },
      { to: 'cancelled', label: 'Cancel booking', danger: true },
    ],
    in_progress: [{ to: 'completed', label: 'Complete trip' }],
  },
};

/** Days until pick-up — drives the countdown banner. */
function daysUntil(date: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
}

export function BookingDetailScreen() {
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
    mutationFn: ({ to, code }: { to: BookingStatus; code?: string }) =>
      api(`/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: to, code }) }),
    onSuccess: () => {
      setCodeActionTo(null);
      setCodeDraft('');
      void qc.invalidateQueries({ queryKey: ['booking-detail', id] });
      void qc.invalidateQueries({ queryKey: ['my-bookings'] });
      void qc.invalidateQueries({ queryKey: ['admin-bookings'] });
      void qc.invalidateQueries({ queryKey: ['vendor-stats'] });
    },
  });
  // REQ-6: which needsCode action currently has its inline code prompt open.
  const [codeActionTo, setCodeActionTo] = useState<BookingStatus | null>(null);
  const [codeDraft, setCodeDraft] = useState('');

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
    return <ErrorNote>{(error as Error | undefined)?.message ?? 'Booking not found.'}</ErrorNote>;
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
        ← Back
      </button>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-karu-mute">{b.reference ?? b.id}</p>
          <h1 className="font-display text-3xl font-bold">
            {b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : 'Booking'}
            {b.vehicle?.year ? <span className="text-karu-mute"> {b.vehicle.year}</span> : null}
          </h1>
        </div>
        <StatusBadge status={b.status} />
      </div>

      {showCountdown && (
        <div className="mt-4 rounded-xl bg-karu-yellow/20 px-4 py-3 text-sm font-semibold text-karu-brown">
          {until === 0 ? 'Pick-up is today' : until === 1 ? 'Pick-up in 1 day' : `Pick-up in ${until} days`}
        </div>
      )}
      {b.status === 'in_progress' && (
        <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
          Trip in progress — due back {prettyDate(b.end_date)}
        </div>
      )}

      {/*
        REQ-6: only the customer's own view carries these (the API nulls
        them out for a vendor/admin read — see hideCodesUnlessCustomer),
        so no extra role check is needed here.
      */}
      {view === 'customer' && b.status === 'confirmed' && b.handover_code && (
        <div className="mt-4 rounded-xl bg-karu-yellow/20 px-4 py-3 text-sm text-karu-brown">
          <p className="font-semibold">Handover code: {b.handover_code}</p>
          <p className="mt-1">Show this to your provider when you collect the car.</p>
        </div>
      )}
      {view === 'customer' && b.status === 'in_progress' && b.return_code && (
        <div className="mt-4 rounded-xl bg-karu-yellow/20 px-4 py-3 text-sm text-karu-brown">
          <p className="font-semibold">Return code: {b.return_code}</p>
          <p className="mt-1">Show this to your provider when you return the car.</p>
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-bold">Trip</h2>
          <div className="mt-2">
            {row('Pick-up', prettyDate(b.start_date))}
            {row('Return', prettyDate(b.end_date))}
            {row('Duration', `${days} day${days > 1 ? 's' : ''}`)}
            {row(
              'Collection',
              b.delivery_type === 'airport'
                ? `Airport meet${b.delivery_address ? ` · ${b.delivery_address}` : ''}`
                : b.delivery_type === 'address'
                  ? `Delivery · ${b.delivery_address}`
                  : (b.pickup_location ?? 'To be arranged'),
            )}
            {b.pickup_time ? row('Time', b.pickup_time.slice(0, 5)) : null}
            {row('Driver', b.with_driver ? 'With a driver' : 'Self-drive')}
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-bold">Price</h2>
          <div className="mt-2">
            {row('Daily rate', xaf(b.daily_rate_xaf))}
            {/* The vehicle line is the total less the extras — with a driver
                or a delivery, days x daily rate is no longer the total. */}
            {row(
              `${days} day${days > 1 ? 's' : ''}`,
              xaf(b.total_xaf - b.driver_fee_xaf - b.delivery_fee_xaf),
            )}
            {b.driver_fee_xaf > 0 ? row('Driver', xaf(b.driver_fee_xaf)) : null}
            {b.delivery_fee_xaf > 0
              ? row(b.delivery_type === 'airport' ? 'Airport meet' : 'Delivery', xaf(b.delivery_fee_xaf))
              : null}
            {row(
              'Total (all fees in)',
              <>
                {xaf(b.total_xaf)}
                {secondary(b.total_xaf) && (
                  <span className="ml-1 font-normal text-karu-mute">({secondary(b.total_xaf)})</span>
                )}
              </>,
            )}
            {b.deposit_xaf ? row('Deposit (15%)', xaf(b.deposit_xaf)) : null}
          </div>
          <DepositBlock bookingId={b.id} view={view} />
        </Card>

        {/* Provider — shown to customers and admins. */}
        {b.vendor && (
          <Card>
            <h2 className="font-display text-lg font-bold">Provider</h2>
            <div className="mt-2">
              {row(
                'Business',
                <Link to={`/vendors/${b.vendor.id}`} className="underline">
                  {b.vendor.business_name}
                </Link>,
              )}
              {row('City', CITY_LABEL[b.vendor.city] ?? b.vendor.city)}
              {b.vendor.contact_phone ? row('Phone', b.vendor.contact_phone) : null}
              {b.vendor.contact_email ? row('Email', b.vendor.contact_email) : null}
            </div>
          </Card>
        )}

        {/* Customer — vendors get a display name only; admins get everything. */}
        {b.customer && (
          <Card>
            <h2 className="font-display text-lg font-bold">Customer</h2>
            <div className="mt-2">
              {row('Name', b.customer.display_name)}
              {b.customer.phone ? row('Phone', b.customer.phone) : null}
              {b.customer.email ? row('Email', b.customer.email) : null}
            </div>
            {view === 'vendor' && (
              <p className="mt-3 text-xs text-karu-mute">
                Customer contact details stay with Karu. Use the chat below — messages go
                straight to the customer, with Karu in the room.
              </p>
            )}
          </Card>
        )}

        {b.vehicle && (
          <Card>
            <h2 className="font-display text-lg font-bold">Vehicle</h2>
            <div className="mt-2">
              {row('Category', CATEGORY_LABEL[b.vehicle.category] ?? b.vehicle.category)}
              {row('Gearbox', b.vehicle.transmission === 'automatic' ? 'Automatic' : 'Manual')}
              {b.vehicle.seats ? row('Seats', b.vehicle.seats) : null}
              {row('City', CITY_LABEL[b.vehicle.city] ?? b.vehicle.city)}
            </div>
            <Link
              to={`/cars/${b.vehicle.id}`}
              className="mt-3 inline-block text-sm font-semibold text-karu-brown underline"
            >
              View listing
            </Link>
          </Card>
        )}

        {b.customer_note && (
          <Card>
            <h2 className="font-display text-lg font-bold">Customer note</h2>
            <p className="mt-2 text-sm">&ldquo;{b.customer_note}&rdquo;</p>
          </Card>
        )}
      </div>

      {actions.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <h2 className="font-display text-lg font-bold">Actions</h2>
          {codeActionTo ? (
            // REQ-6: read the code back from the customer rather than a
            // plain click — replaces the row's usual actions while open.
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={codeDraft}
                onChange={(e) => setCodeDraft(e.target.value)}
                placeholder="Code from customer"
                autoFocus
                className="w-40 rounded-lg border border-karu-ink/15 px-3 py-2 text-sm"
              />
              <Button
                variant="primary"
                disabled={!codeDraft.trim() || transition.isPending}
                onClick={() => transition.mutate({ to: codeActionTo, code: codeDraft.trim() })}
              >
                {transition.isPending ? 'Working…' : actions.find((a) => a.to === codeActionTo)?.label}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setCodeActionTo(null); setCodeDraft(''); }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {actions.map((a) =>
                a.danger ? (
                  <ConfirmButton
                    key={a.to}
                    as={Button}
                    variant="danger"
                    loading={transition.isPending}
                    confirmLabel={`${a.label}?`}
                    onConfirm={() => transition.mutate({ to: a.to })}
                  >
                    {a.label}
                  </ConfirmButton>
                ) : a.needsCode ? (
                  <Button
                    key={a.to}
                    variant="primary"
                    disabled={transition.isPending}
                    onClick={() => { setCodeActionTo(a.to); setCodeDraft(''); }}
                  >
                    {a.label}
                  </Button>
                ) : (
                  <Button
                    key={a.to}
                    variant="primary"
                    disabled={transition.isPending}
                    onClick={() => transition.mutate({ to: a.to })}
                  >
                    {transition.isPending ? 'Working…' : a.label}
                  </Button>
                ),
              )}
            </div>
          )}
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
            prompt={view === 'vendor' ? 'How was this customer?' : 'How was this rental? Rate the provider.'}
          />
        </div>
      )}

      {view === 'customer' && receivedReview.data && receivedReview.data.length > 0 && (
        <ReceivedReview review={receivedReview.data[0]} />
      )}

      <div className="mt-6 flex items-center gap-2 text-xs text-karu-mute">
        <Badge variant="neutral">Requested {prettyDate(b.requested_at.slice(0, 10))}</Badge>
        {b.confirmed_at && <Badge variant="success">Confirmed {prettyDate(b.confirmed_at.slice(0, 10))}</Badge>}
      </div>
    </div>
  );
}

/** Status wording that never overstates what actually happened. */
const PAYMENT_COPY: Record<string, { label: string; tone: 'neutral' | 'success' | 'danger' }> = {
  pending: { label: 'Deposit not yet paid', tone: 'neutral' },
  held: { label: 'Deposit received', tone: 'success' },
  released: { label: 'Paid out to the provider', tone: 'success' },
  refunded: { label: 'Deposit refunded', tone: 'neutral' },
  failed: { label: 'Deposit payment failed', tone: 'danger' },
};

/**
 * The deposit, told truthfully. While the provider is the manual placeholder
 * there is no "Pay now" and no Paid badge — a booking only shows as paid once
 * an admin records that the team actually received the money.
 */
function DepositBlock({ bookingId, view }: { bookingId: string; view: string }) {
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
          {copy.label}
        </p>
      ) : (
        <p className="text-xs text-karu-mute">No deposit recorded yet.</p>
      )}

      {!data?.chargingEnabled && (
        <p className="mt-1 text-xs text-karu-mute">
          Online payment isn&rsquo;t live yet — the Karu team arranges the deposit with you
          directly. Nothing has been charged.
        </p>
      )}

      {view === 'customer' && status !== 'held' && status !== 'released' && (
        <>
          <Button
            variant="outline"
            className="mt-3"
            loading={start.isPending}
            onClick={() => start.mutate()}
          >
            How do I pay the deposit?
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
      <h2 className="font-display text-lg font-bold">Record deposit</h2>
      <p className="mt-1 text-sm text-karu-mute">
        Use this once the team has actually received or returned money. Nothing is marked paid
        automatically.
      </p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          record.mutate();
        }}
      >
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-karu-mute">
            Status
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="rounded-lg border border-karu-ink/15 px-3 py-2 text-sm"
          >
            <option value="held">Deposit received</option>
            <option value="released">Paid out to provider</option>
            <option value="refunded">Refunded to customer</option>
            <option value="failed">Payment failed</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-karu-mute">
            Reference (optional)
          </span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Bank/transfer ref"
            className="rounded-lg border border-karu-ink/15 px-3 py-2 text-sm"
          />
        </label>
        <Button type="submit" loading={record.isPending}>
          Record
        </Button>
      </form>
      {record.isSuccess && (
        <p className="mt-2 text-sm font-semibold text-green-700">Recorded ✓</p>
      )}
      {record.isError && (
        <div className="mt-2">
          <ErrorNote>{(record.error as Error).message}</ErrorNote>
        </div>
      )}
    </Card>
  );
}
