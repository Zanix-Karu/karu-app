import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { Booking } from '@karu/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { prettyDate, xaf } from '../lib/format';
import { Card, ErrorNote, Spinner } from '../ui';

export function ConfirmationScreen() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const location = useLocation();
  const { session } = useAuth();
  const email = session?.user.email;
  const passed = (location.state as { booking?: Booking } | null)?.booking;

  const { data, isLoading, error } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api<Booking>(`/bookings/${id}`),
    initialData: passed,
    enabled: !passed,
  });

  if (isLoading && !passed) return <Spinner label={t('common.loading')} />;
  const booking = data ?? passed;
  if (!booking) return <ErrorNote>{(error as Error | undefined)?.message ?? t('booking.notFound')}</ErrorNote>;

  return (
    <div className="mx-auto max-w-xl">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-karu-yellow text-3xl">
          ✓
        </div>
        <h1 className="mt-4 font-display text-3xl font-bold">{t('booking.requestSent')}</h1>
        <p className="mt-1 text-sm text-karu-mute">
          {t('booking.yourReference')}{' '}
          <span className="font-mono font-semibold text-karu-ink">{booking.reference}</span>
        </p>
      </div>

      <Card className="mt-6 p-6">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-karu-mute">{t('booking.dates')}</dt>
            <dd className="font-semibold">
              {prettyDate(booking.start_date)} → {prettyDate(booking.end_date)}
            </dd>
          </div>
          {booking.pickup_location && (
            <div className="flex justify-between">
              <dt className="text-karu-mute">{t('search.pickUp')}</dt>
              <dd className="font-semibold">{booking.pickup_location}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-karu-mute">{t('booking.total')}</dt>
            <dd className="font-semibold">{xaf(booking.total_xaf)}</dd>
          </div>
          {booking.deposit_xaf && (
            <div className="flex justify-between">
              <dt className="text-karu-mute">{t('booking.depositOnConfirm')}</dt>
              <dd className="font-semibold">{xaf(booking.deposit_xaf)}</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card className="mt-4 p-6">
        <h2 className="font-display text-lg font-bold">{t('booking.whatNext')}</h2>
        {/* Only state things the system actually does. Email delivery is
            best-effort, so it is never claimed in the past tense — the
            bookings page is the reliable source of truth for status. */}
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>{t('booking.next1')}</li>
          <li>
            {t('booking.next2')}
            {email ? t('booking.next2Email', { email }) : null}.
          </li>
          <li>
            {t('booking.next3')}
          </li>
        </ol>
      </Card>

      <div className="mt-6 text-center">
        <Link to="/bookings" className="text-sm font-semibold text-karu-brown underline">
          {t('booking.viewMyBookings')}
        </Link>
      </div>
    </div>
  );
}
