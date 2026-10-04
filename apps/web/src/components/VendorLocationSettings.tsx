import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { validDeliveryZones, type DeliveryZone, type Vendor } from '@karu/shared';
import { api } from '../lib/api';
import { xaf } from '../lib/format';
import { Button, Card, Field, Input } from '../ds';
import { ErrorNote } from '../ui';
import { DOUALA, KaruMap, YAOUNDE, locateMe } from './KaruMap';

/**
 * Where the provider is, and what delivery costs by distance (0034).
 *
 * The pin powers "near me" for customers (shown to them rounded to about a
 * kilometre until a booking is accepted). The rings replace the single flat
 * delivery fee: close by can be free, across town costs more, and beyond the
 * last ring the provider doesn't deliver.
 */
export function VendorLocationSettings({ vendor }: { vendor: Vendor }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fallback = vendor.city === 'yaounde' ? YAOUNDE : DOUALA;
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    vendor.lat != null && vendor.lng != null ? { lat: vendor.lat, lng: vendor.lng } : null,
  );
  const [zones, setZones] = useState<Array<{ max_km: string; fee_xaf: string }>>(
    (vendor.delivery_zones ?? []).map((z) => ({ max_km: String(z.max_km), fee_xaf: String(z.fee_xaf) })),
  );
  const [freeDays, setFreeDays] = useState(vendor.free_delivery_min_days?.toString() ?? '');
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const parsed: DeliveryZone[] = zones
    .filter((z) => z.max_km !== '' && z.fee_xaf !== '')
    .map((z) => ({ max_km: Number(z.max_km), fee_xaf: Number(z.fee_xaf) }));
  const zonesOk = validDeliveryZones(parsed);

  const save = useMutation({
    mutationFn: () =>
      api<Vendor>('/vendors/me', {
        method: 'PATCH',
        body: JSON.stringify({
          ...(pin ? { lat: pin.lat, lng: pin.lng } : {}),
          delivery_zones: parsed,
          free_delivery_min_days: freeDays === '' ? null : Number(freeDays),
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-me'] }),
  });

  const useMyLocation = async () => {
    setLocating(true);
    setLocateError(null);
    try {
      setPin(await locateMe());
    } catch {
      setLocateError(t('location.denied'));
    } finally {
      setLocating(false);
    }
  };

  return (
    <>
      <h2 style={{ margin: '32px 0 14px', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 22 }}>
        {t('location.vendorTitle')}
      </h2>
      <Card>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', margin: '0 0 14px' }}>
          {t('location.vendorSub')}
        </p>

        <KaruMap
          center={pin ?? fallback}
          zoom={pin ? 13 : 12}
          picked={pin}
          onPick={setPin}
          rings={pin && zonesOk ? parsed.map((z) => ({ ...pin, radiusKm: z.max_km, label: `${z.max_km} km · ${xaf(z.fee_xaf)}` })) : []}
          ariaLabel={t('location.vendorMapAria')}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <Button size="sm" variant="outline" loading={locating} onClick={useMyLocation}>
            {t('location.useMine')}
          </Button>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)' }}>
            {pin ? t('location.pinSet') : t('location.tapToSet')}
          </span>
        </div>
        {locateError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{locateError}</p>}

        <h3 style={{ margin: '22px 0 6px', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 16 }}>
          {t('location.zonesTitle')}
        </h3>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)', margin: '0 0 10px' }}>
          {t('location.zonesSub')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {zones.map((z, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label={t('location.upToKm')}>
                <Input
                  type="number"
                  min={1}
                  value={z.max_km}
                  onChange={(e) => setZones(zones.map((x, j) => (j === i ? { ...x, max_km: e.target.value } : x)))}
                  style={{ width: 110 }}
                />
              </Field>
              <Field label={t('location.fee')}>
                <Input
                  type="number"
                  min={0}
                  value={z.fee_xaf}
                  onChange={(e) => setZones(zones.map((x, j) => (j === i ? { ...x, fee_xaf: e.target.value } : x)))}
                  placeholder="0"
                  style={{ width: 130 }}
                />
              </Field>
              <Button size="sm" variant="outline" onClick={() => setZones(zones.filter((_, j) => j !== i))}>
                {t('location.removeZone')}
              </Button>
            </div>
          ))}
          {zones.length < 6 && (
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const last = Number(zones[zones.length - 1]?.max_km || 0);
                  setZones([...zones, { max_km: String(last ? last + 5 : 5), fee_xaf: '' }]);
                }}
              >
                {t('location.addZone')}
              </Button>
            </div>
          )}
        </div>
        {!zonesOk && parsed.length > 0 && (
          <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{t('location.zonesInvalid')}</p>
        )}

        <div style={{ marginTop: 18, maxWidth: 260 }}>
          <Field label={t('location.freeFrom')}>
            <Input
              type="number"
              min={1}
              value={freeDays}
              onChange={(e) => setFreeDays(e.target.value)}
              placeholder={t('location.freeFromNever')}
            />
          </Field>
        </div>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)', margin: '6px 0 0' }}>
          {t('location.freeFromHint')}
        </p>

        <Button
          size="sm"
          style={{ marginTop: 16 }}
          disabled={!zonesOk || (parsed.length > 0 && !pin)}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          {t('location.save')}
        </Button>
        {save.isSuccess && (
          <span style={{ marginLeft: 12, fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--success)' }}>
            {t('vendor.saved')}
          </span>
        )}
        {save.isError && (
          <div style={{ marginTop: 10 }}>
            <ErrorNote>{(save.error as Error).message}</ErrorNote>
          </div>
        )}
      </Card>
    </>
  );
}
