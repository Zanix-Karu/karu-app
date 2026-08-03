import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { LOCALES, LOCALE_LABEL, setLocale, type Locale } from '../i18n';

/**
 * EN/FR switch in the header.
 *
 * For a signed-in user the profile is the source of truth — it's the same
 * `profiles.locale` the API reads when choosing the language of booking
 * emails, so switching here also switches what lands in their inbox. Guests
 * fall back to localStorage.
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const { profile, refreshProfile, session } = useAuth();
  const active = (i18n.resolvedLanguage as Locale) ?? 'en';

  // Adopt the saved preference once the profile loads.
  useEffect(() => {
    if (profile?.locale && profile.locale !== active) {
      void setLocale(profile.locale as Locale);
    }
    // Only react to the stored preference changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.locale]);

  const choose = async (locale: Locale) => {
    await setLocale(locale);
    if (session) {
      try {
        await api('/profiles/me', { method: 'PATCH', body: JSON.stringify({ locale }) });
        await refreshProfile();
      } catch {
        // The interface has already switched; persisting is best-effort.
      }
    }
  };

  return (
    <div className="flex items-center gap-1" role="group" aria-label={t('common.language')}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => void choose(l)}
          aria-current={active === l ? 'true' : undefined}
          className={`rounded-full px-2 py-1 text-xs font-bold uppercase transition ${
            active === l ? 'bg-karu-yellow text-karu-ink' : 'text-karu-cream/60 hover:text-karu-yellow'
          }`}
          title={LOCALE_LABEL[l]}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
