import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { Booking } from '@karu/shared';
import { api } from '../lib/api';
import { prettyDate, xaf } from '../lib/format';
import { Card, ErrorNote, Spinner } from '../ui';

export function ConfirmationScreen() {
  const { id = '' } = useParams();
  const location = useLocation();
  const passed = (location.state as { booking?: Booking } | null)?.booking;

  const { data, isLoading, error } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api<Booking>(`/bookings/${id}`),
    initialData: passed,
    enabled: !passed,
  });

  if (isLoading && !passed) return <Spinner label="Loading booking…" />;
  const booking = data ?? passed;
  if (!booking) return <ErrorNote>{(error as Error | undefined)?.message ?? 'Booking not found.'}</ErrorNote>;

  return (
    <div className="mx-auto max-w-xl">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-karu-yellow text-3xl">
          ✓
        </div>
        <h1 className="mt-4 font-display text-3xl font-bold">Request sent!</h1>
        <p className="mt-1 text-sm text-karu-mute">
          Your reference is{' '}
          <span className="font-mono font-semibold text-karu-ink">{booking.reference}</span>
        </p>
      </div>

      <Card className="mt-6 p-6">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-karu-mute">Dates</dt>
            <dd className="font-semibold">
              {prettyDate(booking.start_date)} → {prettyDate(booking.end_date)}
            </dd>
          </div>
          {booking.pickup_location && (
            <div className="flex justify-between">
              <dt className="text-karu-mute">Pick-up</dt>
              <dd className="font-semibold">{booking.pickup_location}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-karu-mute">Total (all fees in)</dt>
            <dd className="font-semibold">{xaf(booking.total_xaf)}</dd>
          </div>
          {booking.deposit_xaf && (
            <div className="flex justify-between">
              <dt className="text-karu-mute">Deposit due on confirmation</dt>
              <dd className="font-semibold">{xaf(booking.deposit_xaf)}</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card className="mt-4 p-6">
        <h2 className="font-display text-lg font-bold">What happens next?</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>We've emailed you a copy of this request — the provider usually confirms within 24 hours.</li>
          <li>Once confirmed, you'll get a confirmation email with your deposit instructions.</li>
          <li>Show your reference at pick-up. The balance is settled there.</li>
        </ol>
      </Card>

      <div className="mt-6 text-center">
        <Link to="/bookings" className="text-sm font-semibold text-karu-brown underline">
          View my bookings
        </Link>
      </div>
    </div>
  );
}
