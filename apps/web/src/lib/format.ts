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
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const CITY_LABEL: Record<string, string> = {
  douala: 'Douala',
  yaounde: 'Yaoundé',
  other: 'Other',
};

export const CATEGORY_LABEL: Record<string, string> = {
  economy: 'Economy',
  sedan: 'Sedan',
  suv: 'SUV',
  pickup: 'Pickup',
  van: 'Van',
  luxury: 'Luxury',
};
