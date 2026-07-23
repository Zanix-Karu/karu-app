import { useEffect, useState, type FormEvent } from 'react';
import type { Profile } from '@karu/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, ErrorNote, Field, Input, Select } from '../ui';

export function ProfileScreen() {
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
      <h1 className="font-display text-3xl font-bold">Your profile</h1>
      <p className="mt-1 text-sm text-karu-mute">{session?.user.email}</p>

      <Card className="mt-6 p-6">
        <form onSubmit={save} className="space-y-4">
          <Field label="Full name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Phone (for pick-up coordination)">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+237 6 XX XX XX XX"
            />
          </Field>
          <Field label="Preferred language">
            <Select value={locale} onChange={(e) => setLocale(e.target.value as 'en' | 'fr')}>
              <option value="en">English</option>
              <option value="fr">Français</option>
            </Select>
          </Field>

          {error && <ErrorNote>{error}</ErrorNote>}
          {saved && <p className="text-sm font-semibold text-green-700">Saved ✓</p>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
