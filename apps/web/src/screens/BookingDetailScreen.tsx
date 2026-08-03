import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Booking, BookingStatus, Vehicle } from '@karu/shared';
import { api } from '../lib/api';
import { useView } from '../lib/auth';
import { CATEGORY_LABEL, CITY_LABEL, prettyDate, rentalDays, xaf } from '../lib/format';
import { Badge, Button, Card } from '../ds';
import { ErrorNote, StatusBadge } from '../ui';
import { Skeleton, SkeletonCard } from '../components/Skeleton';
import { ReviewForm } from '../components/ReviewForm';

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

/** Transitions each view may drive from this screen. */
const ACTIONS: Record<string, Partial<Record<BookingStatus, Array<{ to: BookingStatus; label: string; danger?: boolean }>>>> = {
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
      { to: 'in_progress', label: 'Start trip' },
      { to: 'cancelled', label: 'Cancel booking', danger: true },
    ],
    in_progress: [{ to: 'completed', label: 'Complete trip' }],
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

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-bold">Trip</h2>
          <div className="mt-2">
            {row('Pick-up', prettyDate(b.start_date))}
            {row('Return', prettyDate(b.end_date))}
            {row('Duration', `${days} day${days > 1 ? 's' : ''}`)}
            {row('Pick-up point', b.pickup_location ?? 'To be arranged')}
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-bold">Price</h2>
          <div className="mt-2">
            {row('Daily rate', xaf(b.daily_rate_xaf))}
            {row(`${days} day${days > 1 ? 's' : ''}`, xaf(b.total_xaf))}
            {row('Total (all fees in)', xaf(b.total_xaf))}
            {b.deposit_xaf ? row('Deposit (15%)', xaf(b.deposit_xaf)) : null}
          </div>
          <p className="mt-3 text-xs text-karu-mute">
            No payment has been taken through Karu — the team arranges the deposit directly.
          </p>
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
                Customer contact details stay with Karu. Message us and we&rsquo;ll pass anything on.
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
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button
                key={a.to}
                variant={a.danger ? 'danger' : 'primary'}
                disabled={transition.isPending}
                onClick={() => {
                  if (a.danger && !window.confirm(`${a.label}?`)) return;
                  transition.mutate(a.to);
                }}
              >
                {transition.isPending ? 'Working…' : a.label}
              </Button>
            ))}
          </div>
          {transition.isError && (
            <div className="mt-3">
              <ErrorNote>{(transition.error as Error).message}</ErrorNote>
            </div>
          )}
        </Card>
      )}

      {b.status === 'completed' && view !== 'admin' && (
        <div className="mt-4">
          <ReviewForm
            bookingId={b.id}
            prompt={view === 'vendor' ? 'How was this customer?' : 'How was this rental? Rate the provider.'}
          />
        </div>
      )}

      <div className="mt-6 flex items-center gap-2 text-xs text-karu-mute">
        <Badge variant="neutral">Requested {prettyDate(b.requested_at.slice(0, 10))}</Badge>
        {b.confirmed_at && <Badge variant="success">Confirmed {prettyDate(b.confirmed_at.slice(0, 10))}</Badge>}
      </div>
    </div>
  );
}
