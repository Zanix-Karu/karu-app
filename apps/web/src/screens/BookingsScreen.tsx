import { Archive, CalendarDays, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { isBookingArchived, type Booking, type BookingStatus, type Review } from '@karu/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { prettyDate, xaf } from '../lib/format';
import { ReviewForm } from '../components/ReviewForm';
import { SegmentPill, segmentButton, segmentWrap } from '../ds';
import { AnimatedList } from '../components/motion/AnimatedList';
import { ReceivedReview } from '../components/ReceivedReview';
import { Skeleton, SkeletonCard } from '../components/Skeleton';
import { ConfirmButton } from '../components/ConfirmButton';
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
  // An admin gets every booking back from /bookings/mine — that is the point
  // of the oversight console at /admin/bookings. Here, "My bookings" has to
  // mean the trips this person actually booked, or the page offers to review
  // rentals they were never part of.
  const { profile } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-bookings', profile?.id ?? 'self'],
    queryFn: async () => {
      const all = await api<Booking[]>('/bookings/mine');
      return profile?.role === 'admin'
        ? all.filter((b) => b.customer_id === profile.id)
        : all;
    },
  });
  // REQ-10: completed/rejected/cancelled trips are done — keep them out of
  // the way rather than clutter the list of what still needs attention.
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const shown = (data ?? []).filter((b) => isBookingArchived(b.status) === (tab === 'archived'));
  const archivedCount = (data ?? []).filter((b) => isBookingArchived(b.status)).length;

  // Which completed bookings the customer has already reviewed, so the form
  // is only offered once.
  const completedIds = (data ?? []).filter((b) => b.status === 'completed').map((b) => b.id);
  const reviewsQuery = useQuery({
    queryKey: ['my-reviews', completedIds.join(',')],
    queryFn: () => api<Review[]>(`/reviews/mine?booking_ids=${completedIds.join(',')}`),
    enabled: completedIds.length > 0,
  });
  const reviewed = new Set((reviewsQuery.data ?? []).map((r) => r.booking_id));

  // The vendor's review of the customer, keyed by booking so each card can
  // show its own if one exists.
  const receivedQuery = useQuery({
    queryKey: ['reviews-about-me', completedIds.join(',')],
    queryFn: () => api<Review[]>(`/reviews/about-me?booking_ids=${completedIds.join(',')}`),
    enabled: completedIds.length > 0,
  });
  const receivedByBooking = new Map((receivedQuery.data ?? []).map((r) => [r.booking_id, r]));

  // UX-2: until this query settles `reviewed` is empty, so every completed
  // booking briefly offered a review form — including ones already reviewed,
  // where submitting would 409. `isFetched` covers the error case too: if the
  // lookup fails we would rather show the form and let the API refuse than
  // hide it forever. Nothing to wait for when there are no completed trips.
  const reviewsSettled = completedIds.length === 0 || reviewsQuery.isFetched;

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
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t('booking.myBookings')}</h1>
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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t('booking.myBookings')}</h1>
        </div>
        <Link
          to="/search"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand shadow-sm transition-colors hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text focus-visible:ring-offset-2"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          {t('nav.findCar')}
        </Link>
      </header>

      {data && data.length > 0 && (
        <div className={`mt-6 ${segmentWrap}`}>
          <button type="button" aria-pressed={tab === 'active'} onClick={() => setTab('active')} className={segmentButton(tab === 'active')}>
            {tab === 'active' && <SegmentPill group="bookings" />}
            {t('booking.tabActive')}
          </button>
          <button type="button" aria-pressed={tab === 'archived'} onClick={() => setTab('archived')} className={segmentButton(tab === 'archived')}>
            {tab === 'archived' && <SegmentPill group="bookings" />}
            {t('booking.tabArchived')} ({archivedCount})
          </button>
        </div>
      )}

      {data && data.length === 0 && (
        <EmptyState
          Icon={CalendarDays}
          title={t('booking.noneTitle')}
          hint={t('booking.noneHint')}
          action={
            <Link
              to="/search"
              className="karu-btn inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
            >
              <Search aria-hidden="true" className="h-4 w-4" />
              {t('nav.findCar')}
            </Link>
          }
        />
      )}
      {data && data.length > 0 && shown.length === 0 && (
        <EmptyState Icon={Archive}
          title={tab === 'archived' ? t('booking.noneArchivedTitle') : t('booking.noneTitle')}
          hint={tab === 'archived' ? t('booking.noneArchivedHint') : t('booking.noneHint')}
        />
      )}

      <AnimatedList className="mt-6 space-y-4">
        {shown.map((b) => {
          const action = CUSTOMER_ACTIONS[b.status];
          return (
            <Card key={b.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-slate-500">{b.reference ?? b.id}</p>
                  <p className="mt-1 font-semibold">
                    {prettyDate(b.start_date)} → {prettyDate(b.end_date)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {xaf(b.total_xaf)}
                    {b.pickup_location ? ` · ${b.pickup_location}` : ''}
                  </p>
                  <Link
                    to={`/bookings/${b.id}`}
                    className="mt-1 inline-block text-xs font-semibold text-slate-800 underline"
                  >
                    {t('common.viewDetails')}
                  </Link>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={b.status} />
                  {action && (
                    <ConfirmButton
                      as={Button}
                      variant="danger"
                      disabled={cancel.isPending}
                      confirmLabel={t('booking.cancelConfirm')}
                      onConfirm={() => cancel.mutate(b.id)}
                    >
                      {action.label}
                    </ConfirmButton>
                  )}
                </div>
              </div>

              {b.status === 'completed' &&
                (reviewsSettled ? (
                  !reviewed.has(b.id) && (
                    <ReviewForm bookingId={b.id} prompt={t('review.ratePrompt')} />
                  )
                ) : (
                  // Reserve the space so the form does not shove the card
                  // contents down when it resolves.
                  <Skeleton height={38} style={{ marginTop: 12 }} />
                ))}

              {receivedByBooking.has(b.id) && (
                <ReceivedReview review={receivedByBooking.get(b.id)!} />
              )}
            </Card>
          );
        })}
      </AnimatedList>

      {cancel.isError && (
        <div className="mt-4">
          <ErrorNote>{(cancel.error as Error).message}</ErrorNote>
        </div>
      )}
    </div>
  );
}
