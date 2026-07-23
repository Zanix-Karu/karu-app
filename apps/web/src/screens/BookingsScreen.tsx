import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Booking, BookingStatus } from '@karu/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { prettyDate, xaf } from '../lib/format';
import { Button, Card, EmptyState, ErrorNote, Spinner, StatusBadge } from '../ui';

/**
 * Actions each role may take from this screen, per booking status. The API
 * enforces the same rules server-side — these just surface the right buttons.
 */
const ACTIONS: Record<
  'customer' | 'vendor',
  Partial<Record<BookingStatus, Array<{ to: BookingStatus; label: string; danger?: boolean; confirm?: string }>>>
> = {
  customer: {
    requested: [{ to: 'cancelled', label: 'Cancel', danger: true, confirm: 'Cancel this booking?' }],
    confirmed: [{ to: 'cancelled', label: 'Cancel', danger: true, confirm: 'Cancel this booking?' }],
  },
  vendor: {
    requested: [
      { to: 'confirmed', label: 'Confirm' },
      { to: 'rejected', label: 'Reject', danger: true, confirm: 'Reject this request?' },
    ],
    confirmed: [
      { to: 'in_progress', label: 'Start trip' },
      { to: 'cancelled', label: 'Cancel', danger: true, confirm: 'Cancel this booking?' },
    ],
    in_progress: [{ to: 'completed', label: 'Complete' }],
  },
};

export function BookingsScreen() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const roleActions =
    profile?.role === 'vendor' ? ACTIONS.vendor : ACTIONS.customer;

  const { data, isLoading, error } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => api<Booking[]>('/bookings/mine'),
  });

  const transition = useMutation({
    mutationFn: ({ id, to }: { id: string; to: BookingStatus }) =>
      api<Booking>(`/bookings/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: to }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-bookings'] }),
  });

  if (isLoading) return <Spinner label="Loading your bookings…" />;
  if (error) return <ErrorNote>{(error as Error).message}</ErrorNote>;

  const isVendor = profile?.role === 'vendor';

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-bold">
        {isVendor ? 'Bookings for your cars' : 'My bookings'}
      </h1>
      {isVendor && (
        <p className="mt-1 text-sm text-karu-mute">
          Confirm or decline requests within 24 hours — customers are notified by email.
        </p>
      )}

      {data && data.length === 0 && (
        <EmptyState
          title="No bookings yet"
          hint={isVendor ? 'Requests for your cars will appear here.' : 'Find a car and send your first request.'}
        />
      )}

      <div className="mt-6 space-y-4">
        {data?.map((b) => (
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
              {isVendor && b.customer_note && (
                <p className="mt-1 text-xs text-karu-mute">“{b.customer_note}”</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={b.status} />
              {roleActions[b.status]?.map((a) => (
                <Button
                  key={a.to}
                  variant={a.danger ? 'danger' : 'primary'}
                  disabled={transition.isPending}
                  onClick={() => {
                    if (a.confirm && !window.confirm(a.confirm)) return;
                    transition.mutate({ id: b.id, to: a.to });
                  }}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {transition.isError && (
        <div className="mt-4">
          <ErrorNote>{(transition.error as Error).message}</ErrorNote>
        </div>
      )}
    </div>
  );
}
