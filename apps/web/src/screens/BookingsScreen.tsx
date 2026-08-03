import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Booking, BookingStatus, Review } from '@karu/shared';
import { api } from '../lib/api';
import { prettyDate, xaf } from '../lib/format';
import { ReviewForm } from '../components/ReviewForm';
import { SkeletonCard } from '../components/Skeleton';
import { Button, Card, EmptyState, ErrorNote, StatusBadge } from '../ui';

/**
 * The customer's own bookings. Vendors have /vendor/bookings and admins have
 * /admin/bookings — each view gets its own surface rather than one screen
 * reinterpreting itself three ways.
 */
const CUSTOMER_ACTIONS: Partial<Record<BookingStatus, { label: string; confirm: string }>> = {
  requested: { label: 'Cancel', confirm: 'Cancel this booking?' },
  confirmed: { label: 'Cancel', confirm: 'Cancel this booking?' },
};

export function BookingsScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => api<Booking[]>('/bookings/mine'),
  });

  // Which completed bookings the customer has already reviewed, so the form
  // is only offered once.
  const completedIds = (data ?? []).filter((b) => b.status === 'completed').map((b) => b.id);
  const { data: myReviews } = useQuery({
    queryKey: ['my-reviews', completedIds.join(',')],
    queryFn: () => api<Review[]>(`/reviews/mine?booking_ids=${completedIds.join(',')}`),
    enabled: completedIds.length > 0,
  });
  const reviewed = new Set((myReviews ?? []).map((r) => r.booking_id));

  const cancel = useMutation({
    mutationFn: (id: string) =>
      api<Booking>(`/bookings/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-bookings'] }),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-bold">{t('booking.myBookings')}</h1>
        <div className="mt-6 space-y-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    );
  }
  if (error) return <ErrorNote>{(error as Error).message}</ErrorNote>;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-bold">{t('booking.myBookings')}</h1>

      {data && data.length === 0 && (
        <EmptyState title={t('booking.noneTitle')} hint={t('booking.noneHint')} />
      )}

      <div className="mt-6 space-y-4">
        {data?.map((b) => {
          const action = CUSTOMER_ACTIONS[b.status];
          return (
            <Card key={b.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-karu-mute">{b.reference ?? b.id}</p>
                  <p className="mt-1 font-semibold">
                    {prettyDate(b.start_date)} → {prettyDate(b.end_date)}
                  </p>
                  <p className="text-sm text-karu-mute">
                    {xaf(b.total_xaf)}
                    {b.pickup_location ? ` · ${b.pickup_location}` : ''}
                  </p>
                  <Link
                    to={`/bookings/${b.id}`}
                    className="mt-1 inline-block text-xs font-semibold text-karu-brown underline"
                  >
                    {t('common.viewDetails')}
                  </Link>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={b.status} />
                  {action && (
                    <Button
                      variant="danger"
                      disabled={cancel.isPending}
                      onClick={() => {
                        if (window.confirm(t('booking.cancelConfirm'))) cancel.mutate(b.id);
                      }}
                    >
                      {action.label}
                    </Button>
                  )}
                </div>
              </div>

              {b.status === 'completed' && !reviewed.has(b.id) && (
                <ReviewForm bookingId={b.id} prompt={t('review.ratePrompt')} />
              )}
            </Card>
          );
        })}
      </div>

      {cancel.isError && (
        <div className="mt-4">
          <ErrorNote>{(cancel.error as Error).message}</ErrorNote>
        </div>
      )}
    </div>
  );
}
