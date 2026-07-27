import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
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

      {profile?.role === 'customer' && <BecomeVendor onDone={refreshProfile} />}
    </div>
  );
}

/** Supply-side onboarding: register the signed-in user as a vendor. */
function BecomeVendor({ onDone }: { onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ business_name: '', city: 'douala', contact_phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/vendors', { method: 'POST', body: JSON.stringify(form) });
      await onDone();
      navigate('/vendor');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-6 p-6">
      <h2 className="font-display text-lg font-bold">Have cars to rent out?</h2>
      <p className="mt-1 text-sm text-karu-mute">
        List your fleet on Karu. We verify your documents, you confirm bookings, customers pay through the platform.
      </p>
      {!open ? (
        <Button className="mt-4" onClick={() => setOpen(true)}>
          Become a provider
        </Button>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <Field label="Business name">
            <Input required value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
          </Field>
          <Field label="City">
            <Select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
              <option value="douala">Douala</option>
              <option value="yaounde">Yaoundé</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Business phone">
            <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="+237 6 XX XX XX XX" />
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Registering…' : 'Register as a provider'}
          </Button>
        </form>
      )}
    </Card>
  );
}
