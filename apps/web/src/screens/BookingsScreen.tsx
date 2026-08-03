import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Booking, BookingStatus } from '@karu/shared';
import { api } from '../lib/api';
import { prettyDate, xaf } from '../lib/format';
import { Button, Card, EmptyState, ErrorNote, Spinner, StatusBadge } from '../ui';

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
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => api<Booking[]>('/bookings/mine'),
  });

  const cancel = useMutation({
    mutationFn: (id: string) =>
      api<Booking>(`/bookings/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-bookings'] }),
  });

  if (isLoading) return <Spinner label="Loading your bookings…" />;
  if (error) return <ErrorNote>{(error as Error).message}</ErrorNote>;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-bold">My bookings</h1>

      {data && data.length === 0 && (
        <EmptyState title="No bookings yet" hint="Find a car and send your first request." />
      )}

      <div className="mt-6 space-y-4">
        {data?.map((b) => {
          const action = CUSTOMER_ACTIONS[b.status];
          return (
            <Card key={b.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="font-mono text-xs text-karu-mute">{b.reference ?? b.id}</p>
                <p className="mt-1 font-semibold">
                  {prettyDate(b.start_date)} → {prettyDate(b.end_date)}
                </p>
                <p className="text-sm text-karu-mute">
                  {xaf(b.total_xaf)}
                  {b.pickup_location ? ` · ${b.pickup_location}` : ''}
                </p>
                {b.status === 'completed' && (
                  <Link
                    to={`/bookings/${b.id}/confirmed`}
                    className="mt-1 inline-block text-xs font-semibold text-karu-brown underline"
                  >
                    View details
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={b.status} />
                {action && (
                  <Button
                    variant="danger"
                    disabled={cancel.isPending}
                    onClick={() => {
                      if (window.confirm(action.confirm)) cancel.mutate(b.id);
                    }}
                  >
                    {action.label}
                  </Button>
                )}
              </div>
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
