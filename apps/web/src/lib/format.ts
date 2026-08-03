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

/**
 * City and category names come from the active translation, so a French user
 * sees "Berline" rather than "Sedan". Kept as Proxies so the many existing
 * CITY_LABEL[x] call sites keep working without a sweep.
 */
export const CITY_LABEL: Record<string, string> = new Proxy(
  {},
  { get: (_t, key: string) => i18n.t(`city.${key}`) },
);

export const CATEGORY_LABEL: Record<string, string> = new Proxy(
  {},
  { get: (_t, key: string) => i18n.t(`category.${key}`) },
);
