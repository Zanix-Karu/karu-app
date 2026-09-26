import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { Profile } from '@karu/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, ErrorNote, Field, Input, PhoneInput, Select } from '../ui';

export function ProfileScreen() {
  const { t } = useTranslation();
  const { profile, refreshProfile, session } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [locale, setLocale] = useState<'en' | 'fr'>('en');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setPhone(profile.phone ?? '');
      setLocale(profile.locale);
    }
  }, [profile]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api<Profile>('/profiles/me', {
        method: 'PATCH',
        body: JSON.stringify({ full_name: fullName, phone: phone || null, locale }),
      });
      await refreshProfile();
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-3xl font-bold">{t('profile.title')}</h1>
      <p className="mt-1 text-sm text-karu-mute">{session?.user.email}</p>

      <Card className="mt-6 p-6">
        <form onSubmit={save} className="space-y-4">
          <Field label={t('profile.fullName')}>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label={t('profile.phone')}>
            <PhoneInput value={phone} onChange={setPhone} placeholder="6 XX XX XX XX" />
          </Field>
          <Field label={t('profile.preferredLanguage')}>
            <Select value={locale} onChange={(e) => setLocale(e.target.value as 'en' | 'fr')}>
              <option value="en">English</option>
              <option value="fr">Français</option>
            </Select>
          </Field>

          {error && <ErrorNote>{error}</ErrorNote>}
          {saved && <p className="text-sm font-semibold text-green-700">{t('profile.saved')}</p>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </form>
      </Card>

      {profile?.role === 'customer' && <BecomeVendor />}
    </div>
  );
}

/** Points at the provider landing page, which carries the real pitch. */
function BecomeVendor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Card className="mt-6 p-6">
      <h2 className="font-display text-lg font-bold">{t('profile.haveCars')}</h2>
      <p className="mt-1 text-sm text-karu-mute">
        {t('profile.haveCarsSub')}
      </p>
      <Button className="mt-4" onClick={() => navigate('/list-your-car')}>
        {t('profile.seeHow')}
      </Button>
    </Card>
  );
}
