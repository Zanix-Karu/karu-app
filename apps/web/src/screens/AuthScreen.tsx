import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button, Card, ErrorNote, Field, Input, Select } from '../ui';

type Mode = 'login' | 'signup' | 'reset';

/**
 * Common near-misses of popular mail domains. A typo here silently creates a
 * real, working account the user can never sign back into, so warn before it
 * happens — sign-in deliberately can't tell them "no such account" afterwards.
 */
const DOMAIN_TYPOS: Record<string, string> = {
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gnail.com': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'yahooo.com': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'iclould.com': 'icloud.com',
};

function domainSuggestion(email: string): string | null {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  const fix = DOMAIN_TYPOS[domain];
  return fix ? `${email.split('@')[0]}@${fix}` : null;
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [locale, setLocale] = useState<'en' | 'fr'>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/search';
  const suggestion = domainSuggestion(email);

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
        if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
          throw new Error("Those email addresses don't match — please check both.");
        }
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
        setConfirmEmail('');
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

          {suggestion && (
            <p className="-mt-2 text-sm text-karu-brown">
              Did you mean{' '}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => {
                  setEmail(suggestion);
                  if (mode === 'signup') setConfirmEmail(suggestion);
                }}
              >
                {suggestion}
              </button>
              ?
            </p>
          )}

          {mode === 'signup' && (
            <Field label="Confirm email">
              <Input
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                required
                autoComplete="email"
                onPaste={(e) => e.preventDefault()}
              />
            </Field>
          )}

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
