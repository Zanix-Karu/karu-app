import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { fr } from './fr';

export type Locale = 'en' | 'fr';
export const LOCALES: Locale[] = ['en', 'fr'];
export const LOCALE_LABEL: Record<Locale, string> = { en: 'English', fr: 'Français' };

const STORAGE_KEY = 'karu.locale';

/**
 * Where the language comes from, in order:
 *   1. an explicit choice, remembered in localStorage
 *   2. the browser's preference, if it is French
 *   3. English
 *
 * Once signed in, profiles.locale wins and is written back here — the same
 * field the API uses to pick the language of transactional email, so the
 * interface and the emails can never disagree.
 */
function initialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'fr') return stored;
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: initialLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
  returnObjects: true, // several keys hold arrays of bullet copy
});

export function setLocale(locale: Locale) {
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
  return i18n.changeLanguage(locale);
}

export function currentLocale(): Locale {
  return (i18n.resolvedLanguage as Locale) ?? 'en';
}

document.documentElement.lang = initialLocale();

export default i18n;
