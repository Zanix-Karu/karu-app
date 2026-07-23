import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Vehicle } from '@karu/shared';
import { api } from '../lib/api';
import { CATEGORY_LABEL, CITY_LABEL, todayISO, xaf } from '../lib/format';
import { Button, Card, CarImage, EmptyState, ErrorNote, Field, Input, Select, Spinner } from '../ui';

interface Filters {
  city: string;
  category: string;
  transmission: string;
  seats: string;
  max_price: string;
  from: string;
  to: string;
  sort: string;
}

const EMPTY: Filters = {
  city: '',
  category: '',
  transmission: '',
  seats: '',
  max_price: '',
  from: '',
  to: '',
  sort: 'price_asc',
};

export function SearchScreen() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(applied)) if (v) params.set(k, v);

  const { data, isLoading, error } = useQuery({
    queryKey: ['vehicles', params.toString()],
    queryFn: () => api<Vehicle[]>(`/vehicles?${params.toString()}`),
  });

  const set = (k: keyof Filters) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  const datesHalfSet = Boolean(draft.from) !== Boolean(draft.to);

  return (
    <div>
      <div className="rounded-2xl bg-karu-ink px-6 py-8">
        <h1 className="font-display text-3xl font-bold text-karu-cream">
          Rent the right car. <span className="text-karu-yellow">Right where you are.</span>
        </h1>
        <p className="mt-1 text-sm text-karu-cream/70">
          Every car inspected, every provider verified, every booking protected.
        </p>

        <form
          className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (!datesHalfSet) setApplied(draft);
          }}
        >
          <Field label="City" className="[&>span]:text-karu-cream/60">
            <Select value={draft.city} onChange={set('city')}>
              <option value="">All cities</option>
              <option value="douala">Douala</option>
              <option value="yaounde">Yaoundé</option>
            </Select>
          </Field>
          <Field label="Type" className="[&>span]:text-karu-cream/60">
            <Select value={draft.category} onChange={set('category')}>
              <option value="">All types</option>
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From" className="[&>span]:text-karu-cream/60">
            <Input type="date" min={todayISO()} value={draft.from} onChange={set('from')} />
          </Field>
          <Field label="To" className="[&>span]:text-karu-cream/60">
            <Input type="date" min={draft.from || todayISO()} value={draft.to} onChange={set('to')} />
          </Field>
          <Field label="Gearbox" className="[&>span]:text-karu-cream/60">
            <Select value={draft.transmission} onChange={set('transmission')}>
              <option value="">Any</option>
              <option value="automatic">Automatic</option>
              <option value="manual">Manual</option>
            </Select>
          </Field>
          <Field label="Seats ≥" className="[&>span]:text-karu-cream/60">
            <Input type="number" min={1} placeholder="Any" value={draft.seats} onChange={set('seats')} />
          </Field>
          <Field label="Max / day (XAF)" className="[&>span]:text-karu-cream/60">
            <Input
              type="number"
              min={0}
              step={5000}
              placeholder="Any"
              value={draft.max_price}
              onChange={set('max_price')}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={datesHalfSet}>
              Search cars
            </Button>
          </div>
        </form>
        {datesHalfSet && (
          <p className="mt-2 text-xs text-karu-yellow">Pick both dates to filter by availability.</p>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-karu-mute">
          {data ? `${data.length} car${data.length === 1 ? '' : 's'} available` : ' '}
        </p>
        <Field label="Sort">
          <Select
            value={applied.sort}
            onChange={(e) => setApplied((a) => ({ ...a, sort: e.target.value }))}
          >
            <option value="price_asc">Price: low → high</option>
            <option value="price_desc">Price: high → low</option>
            <option value="newest">Newest</option>
          </Select>
        </Field>
      </div>

      {isLoading && <Spinner label="Finding cars…" />}
      {error && <ErrorNote>Could not load cars — is the API running? ({(error as Error).message})</ErrorNote>}
      {data && data.length === 0 && (
        <EmptyState title="No cars match" hint="Try widening your dates or clearing a filter." />
      )}

      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((v) => (
          <Link key={v.id} to={`/cars/${v.id}${applied.from && applied.to ? `?from=${applied.from}&to=${applied.to}` : ''}`}>
            <Card className="overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
              <CarImage photos={v.photos} alt={`${v.make} ${v.model}`} className="h-44 w-full" />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg font-bold">
                      {v.make} {v.model}
                      {v.year ? <span className="text-karu-mute"> · {v.year}</span> : null}
                    </h3>
                    <p className="mt-0.5 text-xs text-karu-mute">
                      {CITY_LABEL[v.city]} · {CATEGORY_LABEL[v.category]}
                      {v.seats ? ` · ${v.seats} seats` : ''} · {v.transmission}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm">
                  <span className="font-display text-xl font-bold">{xaf(v.daily_rate_xaf)}</span>
                  <span className="text-karu-mute"> / day · all fees in</span>
                </p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
