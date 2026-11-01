import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { Profile } from '@karu/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, ErrorNote, Field, Input, PhoneInput, Select, SuccessNote } from '../ui';
import { VerifyIdentity } from '../components/VerifyIdentity';
import { ModeSegmented } from '../components/ModeToggle';
import { Link } from 'react-router-dom';
import { Palette } from 'lucide-react';

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
    <div className="max-w-3xl">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t('profile.title')}</h1>
        <p className="mt-1 text-slate-600">{session?.user.email}</p>
      </header>

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
          {saved && <SuccessNote>{t('profile.saved')}</SuccessNote>}

          <Button type="submit" loading={busy}>
            {t('common.save')}
          </Button>
        </form>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-bold text-slate-900">{t('theme.title')}</h2>
        <p className="mt-1 text-sm text-slate-600">{t('theme.sub')}</p>
        <div className="mt-4">
          <ModeSegmented />
        </div>
        {profile?.role === 'admin' && (
          <Link
            to="/admin/appearance"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-text hover:underline"
          >
            <Palette className="h-4 w-4" aria-hidden="true" />
            {t('theme.adminLink')}
          </Link>
        )}
      </Card>

      {profile?.role === 'customer' && <VerifyIdentity />}
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
      <p className="mt-1 text-sm text-slate-500">
        {t('profile.haveCarsSub')}
      </p>
      <Button className="mt-4" onClick={() => navigate('/list-your-car')}>
        {t('profile.seeHow')}
      </Button>
    </Card>
  );
}
