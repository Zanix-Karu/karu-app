import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * One small map for every place Karu needs one (0034): providers near you,
 * a provider setting their base and delivery rings, a customer dropping a
 * delivery pin.
 *
 * Leaflet over MapLibre because it is about a tenth of the size and raster
 * tiles are plenty for "where is it". Tiles come from VITE_MAP_TILE_URL; the
 * OpenStreetMap default is fine for development and light use, but OSM's
 * tile policy asks heavy users to bring their own provider (MapTiler,
 * Stadia, Carto), so set the env var before launch. Whatever host it is must
 * also be allowed in img-src in vercel.json.
 */

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Douala centre: where most Karu supply is, and a sensible empty-state view. */
export const DOUALA = { lat: 4.0511, lng: 9.7679 };
export const YAOUNDE = { lat: 3.848, lng: 11.5021 };

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  /** Short text inside the pin, e.g. a price or a car count. */
  label?: string;
  title?: string;
  tone?: 'brand' | 'ink' | 'you';
  onClick?: () => void;
}

export interface MapRing {
  lat: number;
  lng: number;
  radiusKm: number;
  label?: string;
}

/** Pins drawn as HTML so they pick up the theme tokens and read at a glance. */
function pinIcon(m: MapMarker) {
  return L.divIcon({
    className: '',
    html: `<span class="karu-map-pin karu-map-pin--${m.tone ?? 'brand'}">${m.label ?? ''}</span>`,
    iconSize: undefined,
    iconAnchor: [0, 0],
  });
}

export function KaruMap({
  center,
  zoom = 12,
  markers = [],
  rings = [],
  picked,
  onPick,
  height = 320,
  ariaLabel,
}: {
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  rings?: MapRing[];
  /** The draggable pin, when the map is a picker. */
  picked?: { lat: number; lng: number } | null;
  /** Click or drag to choose a point. Makes the map a picker. */
  onPick?: (p: { lat: number; lng: number }) => void;
  height?: number;
  ariaLabel: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  // Create once.
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(
      [center.lat, center.lng],
      zoom,
    );
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => pickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the centre when it changes (e.g. "near me" resolved).
  useEffect(() => {
    map.current?.setView([center.lat, center.lng], map.current.getZoom() || zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng]);

  // Redraw overlays.
  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    // SVG attributes don't resolve CSS variables, so read the theme colour now.
    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--action-secondary').trim() || '#a2730c';
    for (const r of rings) {
      L.circle([r.lat, r.lng], {
        radius: r.radiusKm * 1000,
        color: accent,
        weight: 1.5,
        fillOpacity: 0.06,
      })
        .bindTooltip(r.label ?? `${r.radiusKm} km`, { sticky: true })
        .addTo(g);
    }
    for (const m of markers) {
      const mk = L.marker([m.lat, m.lng], { icon: pinIcon(m), title: m.title, keyboard: true }).addTo(g);
      if (m.onClick) mk.on('click', m.onClick);
    }
    if (picked) {
      // A div icon rather than Leaflet's default PNG, which bundlers lose.
      const mk = L.marker([picked.lat, picked.lng], {
        icon: pinIcon({ id: 'picked', lat: picked.lat, lng: picked.lng, label: '●', tone: 'you' }),
        draggable: Boolean(onPick),
        keyboard: true,
      }).addTo(g);
      mk.on('dragend', () => {
        const p = mk.getLatLng();
        pickRef.current?.({ lat: p.lat, lng: p.lng });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, rings, picked?.lat, picked?.lng]);

  return (
    <div
      ref={el}
      role="region"
      aria-label={ariaLabel}
      className="karu-map"
      style={{ height, cursor: onPick ? 'crosshair' : undefined }}
    />
  );
}

/** Ask the browser where the user is, once, only after they've asked us to. */
export function locateMe(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  });
}
