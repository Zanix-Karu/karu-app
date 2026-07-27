import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Vehicle } from '@karu/shared';
import { api } from '../lib/api';
import { CATEGORY_LABEL, CITY_LABEL, todayISO } from '../lib/format';
import { Button, CarCard, Card, Field, Input, Select } from '../ds';
import { EmptyState, ErrorNote, Spinner } from '../ui';

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

const label: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontWeight: 700,
  fontSize: 18,
  color: 'var(--ink)',
  marginBottom: 12,
};

export function SearchScreen() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const navigate = useNavigate();

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(applied)) if (v) params.set(k, v);

  const { data, isLoading, error } = useQuery({
    queryKey: ['vehicles', params.toString()],
    queryFn: () => api<Vehicle[]>(`/vehicles?${params.toString()}`),
  });

  const set = (k: keyof Filters) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  const datesHalfSet = Boolean(draft.from) !== Boolean(draft.to);
  const apply = () => {
    if (!datesHalfSet) setApplied(draft);
  };

  return (
    <div>
      {/* Espresso search band — the mockup's dark hero strip */}
      <div
        style={{
          background: 'var(--bg-gradient)',
          borderRadius: 'var(--radius-lg)',
          padding: '40px 48px',
          color: 'var(--white)',
        }}
      >
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 44 }}>
          Rent the right car. <span style={{ color: 'var(--yellow)' }}>Right where you are.</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-ui)', color: 'var(--text-on-dark-muted)', fontSize: 15 }}>
          Every car inspected, every provider verified, every booking protected.
        </p>

        <div
          style={{
            marginTop: 26,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 14,
            alignItems: 'end',
          }}
        >
          <Field label="City" onDark>
            <Select value={draft.city} onChange={set('city')}>
              <option value="">All cities</option>
              <option value="douala">Douala</option>
              <option value="yaounde">Yaoundé</option>
            </Select>
          </Field>
          <Field label="Pick-up" onDark>
            <Input type="date" min={todayISO()} value={draft.from} onChange={set('from')} />
          </Field>
          <Field label="Return" onDark>
            <Input type="date" min={draft.from || todayISO()} value={draft.to} onChange={set('to')} />
          </Field>
          <Button variant="primary" onClick={apply} disabled={datesHalfSet} style={{ height: 50 }}>
            Search cars
          </Button>
        </div>
        {datesHalfSet && (
          <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--yellow-soft)' }}>
            Pick both dates to filter by availability.
          </p>
        )}
      </div>

      {/* Sidebar + results — the mockup's 280px/1fr split */}
      <div className="karu-sidebar-layout" style={{ marginTop: 28 }}>
        <Card pad={24}>
          <div style={label}>Car type</div>
          {[['', 'All'], ...Object.entries(CATEGORY_LABEL)].map(([value, l]) => (
            <label
              key={value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 0',
                fontFamily: 'var(--font-ui)',
                fontWeight: draft.category === value ? 700 : 500,
                fontSize: 15,
                color: 'var(--ink)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="cartype"
                checked={draft.category === value}
                onChange={() => setDraft((d) => ({ ...d, category: value }))}
                style={{ accentColor: 'var(--gold-600)' }}
              />
              {l}
            </label>
          ))}

          <div style={{ ...label, marginTop: 24 }}>Transmission</div>
          <Select value={draft.transmission} onChange={set('transmission')}>
            <option value="">Any</option>
            <option value="automatic">Automatic</option>
            <option value="manual">Manual</option>
          </Select>

          <div style={{ ...label, marginTop: 24 }}>Seats (at least)</div>
          <Input type="number" min={1} placeholder="Any" value={draft.seats} onChange={set('seats')} />

          <div style={{ ...label, marginTop: 24 }}>Max price / day (XAF)</div>
          <Input type="number" min={0} step={5000} placeholder="Any" value={draft.max_price} onChange={set('max_price')} />

          <Button full style={{ marginTop: 24 }} size="sm" onClick={apply} disabled={datesHalfSet}>
            Apply filters
          </Button>
        </Card>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15, color: 'var(--gray-500)' }}>
              {data ? `${data.length} car${data.length === 1 ? '' : 's'} available` : ' '}
            </span>
            <Select
              value={applied.sort}
              onChange={(e) => setApplied((a) => ({ ...a, sort: e.target.value }))}
              style={{ width: 220, padding: '10px 14px' }}
            >
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
              <option value="newest">Newest</option>
            </Select>
          </div>

          {isLoading && <Spinner label="Finding cars…" />}
          {error && <ErrorNote>Could not load cars — is the API running? ({(error as Error).message})</ErrorNote>}
          {data && data.length === 0 && (
            <EmptyState title="No cars match" hint="Try widening your dates or clearing a filter." />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {data?.map((v) => (
              <CarCard
                key={v.id}
                image={v.photos[0]}
                name={`${v.make} ${v.model}`}
                category={`or similar ${CATEGORY_LABEL[v.category]}${v.year ? ` · ${v.year}` : ''}`}
                seats={v.seats ? `${v.seats} Seats` : '—'}
                transmission={v.transmission === 'automatic' ? 'Automatic' : 'Manual'}
                extra={CITY_LABEL[v.city]}
                price={v.daily_rate_xaf}
                subPrice="all fees in"
                onView={() =>
                  navigate(
                    `/cars/${v.id}${applied.from && applied.to ? `?from=${applied.from}&to=${applied.to}` : ''}`,
                  )
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
