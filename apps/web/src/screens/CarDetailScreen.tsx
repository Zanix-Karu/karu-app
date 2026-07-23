import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Booking, Vehicle } from '@karu/shared';
import { computeDepositXaf } from '@karu/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CATEGORY_LABEL, CITY_LABEL, prettyDate, rentalDays, todayISO, xaf } from '../lib/format';
import { Button, Card, CarImage, ErrorNote, Field, Input, Spinner } from '../ui';

interface Availability {
  available: boolean;
  conflicts: Array<{ start_date: string; end_date: string }>;
}

export function CarDetailScreen() {
  const { id = '' } = useParams();
  const [search] = useSearchParams();
  const { session } = useAuth();
  const navigate = useNavigate();

  const [from, setFrom] = useState(search.get('from') ?? '');
  const [to, setTo] = useState(search.get('to') ?? '');
  const [pickup, setPickup] = useState('');
  const [note, setNote] = useState('');

  const { data: car, isLoading } = useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => api<Vehicle>(`/vehicles/${id}`),
  });

  const windowChosen = Boolean(from && to && from <= to);

  const { data: avail, isFetching: checking } = useQuery({
    queryKey: ['availability', id, from, to],
    queryFn: () => api<Availability>(`/vehicles/${id}/availability?from=${from}&to=${to}`),
    enabled: windowChosen,
  });

  const book = useMutation({
    mutationFn: () =>
      api<Booking>('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: id,
          start_date: from,
          end_date: to,
          pickup_location: pickup || undefined,
          customer_note: note || undefined,
        }),
      }),
    onSuccess: (booking) =>
      navigate(`/bookings/${booking.id}/confirmed`, { state: { booking } }),
  });

  if (isLoading) return <Spinner label="Loading car…" />;
  if (!car) return <ErrorNote>Car not found.</ErrorNote>;

  const days = windowChosen ? rentalDays(from, to) : 0;
  const total = days * car.daily_rate_xaf;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div>
        <CarImage photos={car.photos} alt={`${car.make} ${car.model}`} className="h-80 w-full rounded-2xl" />
        {car.photos.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {car.photos.slice(1, 6).map((p) => (
              <img key={p} src={p} alt="" className="h-20 w-28 rounded-lg object-cover" />
            ))}
          </div>
        )}

        <h1 className="mt-6 font-display text-3xl font-bold">
          {car.make} {car.model} {car.year && <span className="text-karu-mute">{car.year}</span>}
        </h1>
        <p className="mt-1 text-sm text-karu-mute">
          {CITY_LABEL[car.city]} · {CATEGORY_LABEL[car.category]}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            car.transmission === 'automatic' ? 'Automatic' : 'Manual',
            ...(car.seats ? [`${car.seats} seats`] : []),
            'Verified provider',
          ].map((f) => (
            <span
              key={f}
              className="rounded-full border border-karu-ink/15 bg-white px-3 py-1 text-xs font-semibold text-karu-brown"
            >
              {f}
            </span>
          ))}
        </div>

        {car.description && <p className="mt-5 max-w-prose text-sm leading-6">{car.description}</p>}

        {car.pickup_locations.length > 0 && (
          <div className="mt-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-karu-mute">
              Pick-up locations
            </h2>
            <ul className="mt-1 text-sm">
              {car.pickup_locations.map((p) => (
                <li key={p}>· {p}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 rounded-xl bg-karu-yellow/15 px-4 py-3 text-xs text-karu-brown">
          Free cancellation up to 48h before pick-up · No hidden fees — what you see is what you pay
        </div>
      </div>

      <Card className="h-fit p-5">
        <p className="font-display text-2xl font-bold">
          {xaf(car.daily_rate_xaf)} <span className="text-sm font-normal text-karu-mute">/ day</span>
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Pick-up">
            <Input type="date" min={todayISO()} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Return">
            <Input type="date" min={from || todayISO()} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>

        {windowChosen && (
          <div className="mt-3 text-sm">
            {checking && <p className="text-karu-mute">Checking availability…</p>}
            {avail && avail.available && (
              <p className="font-semibold text-green-700">
                ✓ Available {prettyDate(from)} → {prettyDate(to)}
              </p>
            )}
            {avail && !avail.available && (
              <p className="font-semibold text-karu-terracotta">
                Not available for those dates — try different ones.
              </p>
            )}
          </div>
        )}

        {windowChosen && avail?.available && (
          <>
            <Field label="Preferred pick-up point" className="mt-3">
              <Input
                list="pickups"
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                placeholder={car.pickup_locations[0] ?? 'e.g. airport'}
              />
              <datalist id="pickups">
                {car.pickup_locations.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
            <Field label="Note to the provider (optional)" className="mt-3">
              <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </Field>

            <div className="mt-4 space-y-1 border-t border-karu-ink/10 pt-4 text-sm">
              <div className="flex justify-between">
                <span>
                  {xaf(car.daily_rate_xaf)} × {days} day{days > 1 ? 's' : ''}
                </span>
                <span>{xaf(total)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Total (all fees in)</span>
                <span>{xaf(total)}</span>
              </div>
              <div className="flex justify-between text-karu-brown">
                <span>Deposit due now (15%)</span>
                <span>{xaf(computeDepositXaf(total))}</span>
              </div>
              <p className="pt-1 text-xs text-karu-mute">
                Deposit is payable once the provider confirms. Balance at pick-up.
              </p>
            </div>
          </>
        )}

        {book.isError && (
          <div className="mt-3">
            <ErrorNote>{(book.error as Error).message}</ErrorNote>
          </div>
        )}

        <Button
          className="mt-4 w-full"
          disabled={!windowChosen || !avail?.available || book.isPending}
          onClick={() => {
            if (!session) {
              navigate('/auth', { state: { from: `/cars/${id}?from=${from}&to=${to}` } });
              return;
            }
            book.mutate();
          }}
        >
          {book.isPending ? 'Sending request…' : session ? 'Request to book' : 'Sign in to book'}
        </Button>
        <p className="mt-2 text-center text-xs text-karu-mute">
          No charge yet — the provider confirms within 24h.
        </p>
      </Card>
    </div>
  );
}
