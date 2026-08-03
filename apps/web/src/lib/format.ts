import i18n from '../i18n';

/** Formatting helpers shared by every screen. */

export const xaf = (n: number) => `${n.toLocaleString('fr-FR')} XAF`;

/** Inclusive rental day count — same-day pick-up/return is one day. */
export function rentalDays(start: string, end: string): number {
  const ms = Date.parse(end) - Date.parse(start);
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / 86_400_000) + 1;
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function prettyDate(iso: string): string {
  const tag = i18n.resolvedLanguage === 'fr' ? 'fr-FR' : 'en-GB';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(tag, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** The enum values, in the order they should be offered. */
export const CITIES = ['douala', 'yaounde', 'other'] as const;
export const CATEGORIES = ['economy', 'sedan', 'suv', 'pickup', 'van', 'luxury'] as const;

/**
 * City and category names come from the active translation, so a French user
 * sees "Berline" rather than "Sedan". Proxies keep the many existing
 * CITY_LABEL[x] call sites working without a sweep.
 *
 * The enumeration traps matter: screens build their filter lists with
 * Object.entries(CATEGORY_LABEL), and a Proxy with only a `get` trap
 * enumerates the (empty) target — which silently emptied the car-type filter.
 */
function labelProxy(keys: readonly string[], ns: string): Record<string, string> {
  return new Proxy({} as Record<string, string>, {
    get: (_t, key: string) => i18n.t(`${ns}.${key}`),
    has: (_t, key: string) => keys.includes(key as string),
    ownKeys: () => [...keys],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });
}

export const CITY_LABEL: Record<string, string> = labelProxy(CITIES, 'city');
export const CATEGORY_LABEL: Record<string, string> = labelProxy(CATEGORIES, 'category');
