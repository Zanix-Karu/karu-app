import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Booking } from '@karu/shared';
import { api } from '../lib/api';
import { Button, Card } from '../ds';
import { ErrorNote } from '../ui';
import { KaruMap, type MapMarker } from './KaruMap';

type TrackingState =
  | { active: false }
  | {
      active: true;
      started_at: string;
      position: { lat: number; lng: number } | null;
      updated_at: string | null;
      stale: boolean;
      destination: { lat: number; lng: number } | null;
      distance_km: number | null;
      eta_minutes: number | null;
    };

/** How often the driver's phone reports, and the customer's map refreshes. */
const INTERVAL_MS = 10_000;

/** Can this booking be tracked at all? The car has to be coming to the customer. */
export function trackable(b: Booking): boolean {
  return b.status === 'confirmed' && (b.delivery_type !== 'pickup_point' || b.with_driver);
}

/**
 * Uber-style tracking of the delivery leg (0035).
 *
 * The provider taps "On my way" and their phone shares its position until the
 * handover; the customer sees the car move towards them with a rough ETA.
 * This is a web app, so the phone only reports while this page is open: the
 * screen wake lock keeps it awake, and the driver is told plainly to leave it
 * open. Reliable background tracking needs a native app.
 */
export function LiveTracking({ booking, view }: { booking: Booking; view: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isProvider = view === 'vendor' || view === 'admin';
  const { data } = useQuery({
    queryKey: ['tracking', booking.id],
    queryFn: () => api<TrackingState>(`/bookings/${booking.id}/tracking`),
    refetchInterval: (q) => (q.state.data?.active ? INTERVAL_MS : isProvider ? false : 30_000),
  });

  const [sharing, setSharing] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const lastSent = useRef(0);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  const stopWatching = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    void wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
    setSharing(false);
  };

  const beginWatching = async () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError(t('tracking.noGeo'));
      return;
    }
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (k: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      wakeLock.current = (await wl?.request('screen')) ?? null;
    } catch {
      // Not fatal: the driver is also told to keep the screen on.
    }
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now();
        if (now - lastSent.current < INTERVAL_MS) return;
        lastSent.current = now;
        void api(`/bookings/${booking.id}/tracking`, {
          method: 'POST',
          body: JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude }),
        }).catch(() => undefined);
      },
      () => setGeoError(t('tracking.geoDenied')),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    setSharing(true);
  };

  // Leaving the page ends sharing on this device (the server keeps the last point).
  useEffect(() => stopWatching, []);

  const start = useMutation({
    mutationFn: () => api(`/bookings/${booking.id}/tracking/start`, { method: 'POST' }),
    onSuccess: async () => {
      await beginWatching();
      void qc.invalidateQueries({ queryKey: ['tracking', booking.id] });
    },
  });
  const stop = useMutation({
    mutationFn: () => api(`/bookings/${booking.id}/tracking/stop`, { method: 'POST' }),
    onSuccess: () => {
      stopWatching();
      void qc.invalidateQueries({ queryKey: ['tracking', booking.id] });
    },
  });

  const markers = useMemo<MapMarker[]>(() => {
    if (!data?.active) return [];
    const m: MapMarker[] = [];
    if (data.destination) m.push({ id: 'dest', ...data.destination, label: t('tracking.destination'), tone: 'ink' });
    if (data.position) m.push({ id: 'car', ...data.position, label: t('tracking.car'), tone: 'brand' });
    return m;
  }, [data, t]);

  if (!trackable(booking) && !data?.active) return null;

  return (
    <Card style={{ marginTop: 16 }}>
      <h2 className="font-display text-lg font-bold">{t('tracking.title')}</h2>

      {isProvider && (
        <div className="mt-2">
          {!data?.active ? (
            <>
              <p className="text-sm text-karu-mute">{t('tracking.providerIntro')}</p>
              <Button className="mt-3" loading={start.isPending} onClick={() => start.mutate()}>
                {t('tracking.start')}
              </Button>
            </>
          ) : (
            <>
              <p className={`text-sm font-semibold ${sharing ? 'text-green-700' : 'text-karu-brown'}`}>
                {sharing ? t('tracking.sharing') : t('tracking.paused')}
              </p>
              <p className="mt-1 text-xs text-karu-mute">{t('tracking.keepOpen')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!sharing && <Button onClick={() => void beginWatching()}>{t('tracking.resume')}</Button>}
                <Button variant="outline" loading={stop.isPending} onClick={() => stop.mutate()}>
                  {t('tracking.stop')}
                </Button>
              </div>
            </>
          )}
          {(geoError || start.isError) && (
            <div className="mt-2">
              <ErrorNote>{geoError ?? (start.error as Error).message}</ErrorNote>
            </div>
          )}
        </div>
      )}

      {!isProvider && !data?.active && <p className="mt-2 text-sm text-karu-mute">{t('tracking.notYet')}</p>}

      {data?.active && (
        <div className="mt-3 karu-fade-in">
          {!isProvider && (
            <p className="text-sm font-semibold">
              {data.position && data.eta_minutes != null
                ? t('tracking.eta', { minutes: data.eta_minutes, km: data.distance_km })
                : t('tracking.onTheWay')}
            </p>
          )}
          {data.stale && data.position && (
            <p className="mt-1 text-xs text-karu-mute">{t('tracking.stale')}</p>
          )}
          {(data.position || data.destination) && (
            <div className="mt-3">
              <KaruMap
                center={data.position ?? data.destination!}
                zoom={14}
                height={260}
                markers={markers}
                fit
                ariaLabel={t('tracking.mapAria')}
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
