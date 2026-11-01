import type { DisplayCurrency } from '@karu/shared';

/** Euro-zone countries, by region code. */
const EURO = new Set([
  'AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES',
]);

const EURO_ZONES = new Set([
  'Europe/Paris', 'Europe/Berlin', 'Europe/Brussels', 'Europe/Amsterdam', 'Europe/Madrid', 'Europe/Rome', 'Europe/Dublin', 'Europe/Lisbon',
]);

const UK_ZONES = new Set(['Europe/London', 'Europe/Belfast']);

/**
 * The secondary currency a first-time visitor most likely thinks in, from
 * their browser's region and time zone. Region wins when it's a country we
 * recognise; the time zone covers browsers set to a bare "en" or "fr", where
 * the language alone says nothing about where the person is. People in
 * Cameroon, or anywhere we can't tell, stay on XAF.
 */
export function guessCurrency(languages: readonly string[], timeZone?: string): DisplayCurrency {
  for (const tag of languages) {
    const region = tag.split('-')[1]?.toUpperCase();
    if (!region || region.length !== 2) continue;
    if (region === 'CM') return 'XAF';
    if (region === 'GB') return 'GBP';
    if (EURO.has(region)) return 'EUR';
  }
  if (timeZone && UK_ZONES.has(timeZone)) return 'GBP';
  if (timeZone && EURO_ZONES.has(timeZone)) return 'EUR';
  return 'XAF';
}

export function detectCurrency(): DisplayCurrency {
  try {
    return guessCurrency(
      navigator.languages?.length ? navigator.languages : [navigator.language],
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  } catch {
    return 'XAF';
  }
}
