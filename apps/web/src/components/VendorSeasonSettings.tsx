import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { validPriceSeasons, type PriceSeason, type Vendor } from '@karu/shared';
import { api } from '../lib/api';
import { Button, Card, Field, Input } from '../ds';
import { ErrorNote, SuccessNote } from '../ui';

interface Row {
  label: string;
  from: string;
  to: string;
  percent: string;
}

/** The input type="date" value for a yearly "MM-DD" (the year is a throwaway leap year). */
const toDate = (md: string) => (md ? `2024-${md}` : '');
const fromDate = (iso: string) => iso.slice(5, 10);

/**
 * Seasonal prices (0037): raise or cut the daily rate for a yearly date range,
 * e.g. +20% from 15 Dec to 5 Jan. Applied to new quotes only; a booking keeps
 * the price it was made at.
 */
export function VendorSeasonSettings({ vendor }: { vendor: Vendor }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>(
    (vendor.price_seasons ?? []).map((s) => ({ ...s, percent: String(s.percent) })),
  );

  const parsed: PriceSeason[] = rows
    .filter((r) => r.label.trim() && r.from && r.to && r.percent !== '')
    .map((r) => ({ label: r.label.trim(), from: r.from, to: r.to, percent: Number(r.percent) }));
  const complete = parsed.length === rows.length;
  const ok = complete && validPriceSeasons(parsed);

  const save = useMutation({
    mutationFn: () =>
      api<Vendor>('/vendors/me', { method: 'PATCH', body: JSON.stringify({ price_seasons: parsed }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-me'] }),
  });

  const update = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <>
      <h2 style={{ margin: '32px 0 16px', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 22 }}>
        {t('seasons.title')}
      </h2>
      <Card>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', margin: '0 0 16px' }}>
          {t('seasons.sub')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label={t('seasons.name')}>
                <Input value={r.label} maxLength={40} onChange={(e) => update(i, { label: e.target.value })} style={{ width: 170 }} />
              </Field>
              <Field label={t('seasons.from')}>
                <Input type="date" value={toDate(r.from)} onChange={(e) => update(i, { from: fromDate(e.target.value) })} />
              </Field>
              <Field label={t('seasons.to')}>
                <Input type="date" value={toDate(r.to)} onChange={(e) => update(i, { to: fromDate(e.target.value) })} />
              </Field>
              <Field label={t('seasons.percent')}>
                <Input
                  type="number"
                  min={-50}
                  max={100}
                  value={r.percent}
                  onChange={(e) => update(i, { percent: e.target.value })}
                  style={{ width: 90 }}
                />
              </Field>
              <Button size="sm" variant="outline" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                {t('seasons.remove')}
              </Button>
            </div>
          ))}
          {rows.length < 8 && (
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRows([...rows, { label: '', from: '', to: '', percent: '20' }])}
              >
                {t('seasons.add')}
              </Button>
            </div>
          )}
        </div>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)', margin: '12px 0 0' }}>
          {t('seasons.hint')}
        </p>
        {rows.length > 0 && !ok && (
          <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{t('seasons.invalid')}</p>
        )}
        <Button size="sm" style={{ marginTop: 16 }} disabled={!ok} loading={save.isPending} onClick={() => save.mutate()}>
          {t('seasons.save')}
        </Button>
        {save.isSuccess && <SuccessNote className="ml-3">{t('vendor.saved')}</SuccessNote>}
        {save.isError && (
          <div style={{ marginTop: 12 }}>
            <ErrorNote>{(save.error as Error).message}</ErrorNote>
          </div>
        )}
      </Card>
    </>
  );
}
