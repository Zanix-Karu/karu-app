import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button, Card, ErrorNote, Field, Input, Select } from '../ui';

type Mode = 'login' | 'signup' | 'reset';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [locale, setLocale] = useState<'en' | 'fr'>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/search';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(from, { replace: true });
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, locale } },
        });
        if (error) throw error;
        if (data.session) navigate(from, { replace: true });
        else setNotice('Check your inbox — confirm your email, then sign in.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/auth',
        });
        if (error) throw error;
        setNotice('If that address has an account, a reset link is on its way.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        setError(null);
        setNotice(null);
      }}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        mode === m ? 'bg-karu-ink text-karu-cream' : 'text-karu-brown hover:bg-karu-ink/5'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-3xl font-bold">Welcome to Karu</h1>
      <p className="mt-1 text-sm text-karu-mute">
        Verified cars, real providers — Douala &amp; Yaoundé.
      </p>

      <Card className="mt-6 p-6">
        <div className="mb-5 flex gap-2">
          {tab('login', 'Sign in')}
          {tab('signup', 'Create account')}
          {tab('reset', 'Reset password')}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <Field label="Full name">
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </Field>
              <Field label="Preferred language">
                <Select value={locale} onChange={(e) => setLocale(e.target.value as 'en' | 'fr')}>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </Select>
              </Field>
            </>
          )}

          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>

          {mode !== 'reset' && (
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </Field>
          )}

          {error && <ErrorNote>{error}</ErrorNote>}
          {notice && (
            <div className="rounded-lg border border-karu-gold/40 bg-karu-yellow/15 px-4 py-3 text-sm text-karu-brown">
              {notice}
            </div>
          )}

          <Button type="submit" disabled={busy} className="w-full">
            {busy
              ? 'One moment…'
              : mode === 'login'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Send reset link'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
