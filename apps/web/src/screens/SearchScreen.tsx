import { useEffect, useMemo, useState } from 'react';
import { usePageMeta } from '../lib/page-meta';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { primaryPhoto, type Vehicle } from '@karu/shared';
import { api, type Page } from '../lib/api';
import { CATEGORY_LABEL, CITY_LABEL, todayISO } from '../lib/format';
import { Button, CarCard, Card, Field, Input, Select } from '../ds';
import { EmptyState, ErrorNote } from '../ui';
import { SkeletonCarCard } from '../components/Skeleton';
import { useCurrency } from '../lib/currency';

interface Filters {
  city: string;
  category: string;
  transmission: string;
  with_driver: string;
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
  with_driver: '',
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
  const { t } = useTranslation();
  usePageMeta({
    title: t('seo.search.title'),
    description: t('seo.search.description'),
  });
  const { secondary } = useCurrency();
  const PAGE = 12;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /**
   * The URL is the source of truth for what has been applied.
   *
   * Keeping it in component state meant a search could not be shared or
   * bookmarked, and the browser's own Back button walked out of the page
   * instead of back through the results. Anything a customer would send to
   * the family member who is actually travelling belongs in the address bar.
   */
  const applied = useMemo<Filters>(() => {
    const f = { ...EMPTY };
    for (const k of Object.keys(EMPTY) as (keyof Filters)[]) {
      const v = searchParams.get(k);
      if (v) f[k] = v;
    }
    return f;
  }, [searchParams]);
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0);

  // The form holds the un-applied edits; the URL holds what's in effect.
  const [draft, setDraft] = useState<Filters>(applied);
  // Re-sync when the URL changes underneath — going Back has to move the
  // controls too, not just the results.
  useEffect(() => setDraft(applied), [applied]);

  /** Write a filter set to the URL; defaults are omitted to keep links short. */
  const commit = (next: Filters, nextOffset = 0) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v && v !== EMPTY[k as keyof Filters]) p.set(k, v);
    }
    if (nextOffset > 0) p.set('offset', String(nextOffset));
    setSearchParams(p);
  };

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(applied)) if (v) params.set(k, v);
  params.set('limit', String(PAGE));
  params.set('offset', String(offset));

  const { data, isLoading, error } = useQuery({
    queryKey: ['vehicles', params.toString()],
    queryFn: () => api<Page<Vehicle>>(`/vehicles?${params.toString()}`),
    placeholderData: (prev) => prev, // keep the list visible while paging
  });
  const cars = data?.items;
  const total = data?.total ?? 0;

  const set = (k: keyof Filters) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  const datesHalfSet = Boolean(draft.from) !== Boolean(draft.to);
  const apply = () => {
    if (!datesHalfSet) commit(draft); // a new filter set starts at page 1
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
          {t('search.heroA')} <span style={{ color: 'var(--yellow)' }}>{t('search.heroB')}</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-ui)', color: 'var(--text-on-dark-muted)', fontSize: 15 }}>
          {t('search.sub')}
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
          <Field label={t('search.city')} onDark>
            <Select value={draft.city} onChange={set('city')}>
              <option value="">{t('search.allCities')}</option>
              <option value="douala">Douala</option>
              <option value="yaounde">Yaoundé</option>
            </Select>
          </Field>
          <Field label={t('search.pickUp')} onDark>
            <Input type="date" min={todayISO()} value={draft.from} onChange={set('from')} />
          </Field>
          <Field label={t('search.return')} onDark>
            <Input type="date" min={draft.from || todayISO()} value={draft.to} onChange={set('to')} />
          </Field>
          <Button variant="primary" onClick={apply} disabled={datesHalfSet} style={{ height: 50 }}>
            {t('search.searchCars')}
          </Button>
        </div>
        {datesHalfSet && (
          <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--yellow-soft)' }}>
            {t('search.bothDates')}
          </p>
        )}
      </div>

      {/* Sidebar + results — the mockup's 280px/1fr split */}
      <div className="karu-sidebar-layout" style={{ marginTop: 28 }}>
        <Card pad={24}>
          {/*
            A fieldset/legend so the group announces as "Car type" rather than
            seven loose radios, and an explicit `value` on each input — without
            one the DOM value defaults to "on", which is what screen readers
            were reading out for every option.
          */}
          <fieldset style={{ border: 0, margin: 0, padding: 0, minInlineSize: 'auto' }}>
            <legend style={label}>{t('search.carType')}</legend>
            {[['', t('search.all')], ...Object.entries(CATEGORY_LABEL)].map(([value, l]) => (
              <label
                key={value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  // >=24px tall: WCAG 2.2 target size. The radio itself is
                  // 13px, so the row carries the hit area.
                  minHeight: 24,
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
                  value={value}
                  checked={draft.category === value}
                  onChange={() => setDraft((d) => ({ ...d, category: value }))}
                  style={{ accentColor: 'var(--gold-600)', width: 18, height: 18 }}
                />
                {l}
              </label>
            ))}
          </fieldset>

          {/* Placed above transmission on purpose: for someone booking from
              abroad for family at home, "with a driver" is the first question,
              and gearbox is often not a question at all. */}
          <Field label={t('search.driver')} style={{ marginTop: 24 }}>
            <Select value={draft.with_driver} onChange={set('with_driver')}>
              <option value="">{t('search.any')}</option>
              <option value="true">{t('search.withDriverOnly')}</option>
            </Select>
          </Field>

          <Field label={t('search.transmission')} style={{ marginTop: 24 }}>
            <Select value={draft.transmission} onChange={set('transmission')}>
              <option value="">{t('search.any')}</option>
              <option value="automatic">{t('common.automatic')}</option>
              <option value="manual">{t('common.manual')}</option>
            </Select>
          </Field>

          <Field label={t('search.seatsAtLeast')} style={{ marginTop: 24 }}>
            <Input type="number" min={1} placeholder="Any" value={draft.seats} onChange={set('seats')} />
          </Field>

          <Field label={t('search.maxPrice')} style={{ marginTop: 24 }}>
            <Input type="number" min={0} step={5000} placeholder="Any" value={draft.max_price} onChange={set('max_price')} />
          </Field>

          <Button full style={{ marginTop: 24 }} size="sm" onClick={apply} disabled={datesHalfSet}>
            {t('search.applyFilters')}
          </Button>
        </Card>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15, color: 'var(--gray-500)' }}>
              {data ? t('search.available', { count: total }) : ' '}
            </span>
            <Select
              aria-label={t('search.sortBy')}
              value={applied.sort}
              onChange={(e) => commit({ ...applied, sort: e.target.value })}
              style={{ width: 220, padding: '10px 14px' }}
            >
              <option value="price_asc">{t('search.sortPriceAsc')}</option>
              <option value="price_desc">{t('search.sortPriceDesc')}</option>
              <option value="newest">{t('search.sortNewest')}</option>
            </Select>
          </div>

          {isLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <SkeletonCarCard />
              <SkeletonCarCard />
              <SkeletonCarCard />
            </div>
          )}
          {error && (
            <ErrorNote>
              {t('search.loadError')}
            </ErrorNote>
          )}
          {cars && cars.length === 0 && (
            <EmptyState title={t('search.noneTitle')} hint={t('search.noneHint')} />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {cars?.map((v) => (
              <CarCard
                key={v.id}
                headingLevel="h2"
                image={primaryPhoto(v)}
                name={`${v.make} ${v.model}`}
                category={`${t('search.orSimilar', { category: CATEGORY_LABEL[v.category] })}${v.year ? ` · ${v.year}` : ''}`}
                seats={v.seats ? t('common.seats', { count: v.seats }) : '—'}
                transmission={v.transmission === 'automatic' ? t('common.automatic') : t('common.manual')}
                extra={CITY_LABEL[v.city]}
                price={v.daily_rate_xaf}
                subPrice={t('common.allFeesIn')}
                perDayLabel={t('common.perDay')}
                viewLabel={t('common.viewDetails')}
        secondaryPrice={secondary(v.daily_rate_xaf)}
                onView={() =>
                  navigate(
                    `/cars/${v.id}${applied.from && applied.to ? `?from=${applied.from}&to=${applied.to}` : ''}`,
                  )
                }
              />
            ))}
          </div>

          {/* Also shown when offset > 0 even if everything fits one page: now
              that offset lives in the URL, a shared deep link could otherwise
              strand someone on a partial page with no control to get back. */}
          {(total > PAGE || offset > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 24 }}>
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => commit(applied, Math.max(0, offset - PAGE))}
              >
                ← {t('search.prev')}
              </Button>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)' }}>
                {t('search.showing', {
                  from: Math.min(offset + 1, total),
                  to: Math.min(offset + PAGE, total),
                  total,
                })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + PAGE >= total}
                onClick={() => commit(applied, offset + PAGE)}
              >
                {t('search.next')} →
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
