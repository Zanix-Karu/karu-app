import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { Button, Card, ErrorNote, Field, Input, Select } from '../ui';

type Mode = 'login' | 'signup' | 'reset';
/** The mockup's account-type switch: rent a car, or list one. */
type Account = 'customer' | 'vendor';

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

/** Why each audience should bother — shown beside the form. */
const PITCH: Record<Account, { title: string; sub: string; points: string[] }> = {
  customer: {
    title: 'Rent the right car, right where you are.',
    sub: 'One account to book verified cars across Douala and Yaoundé.',
    points: [
      'Every provider document-verified before they can list',
      'Total price up front — no hidden fees at the counter',
      'Cancel any time before pick-up at no cost',
    ],
  },
  vendor: {
    title: 'List your fleet and reach renters across Cameroon.',
    sub: 'Karu brings you booking requests. You choose which to accept.',
    points: [
      'You set the price and the availability — always',
      'We verify every renter, and handle the customer conversation',
      'No listing fee: you only hear from us when there is a booking',
    ],
  },
};

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [account, setAccount] = useState<Account>('customer');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [locale, setLocale] = useState<'en' | 'fr'>('en');
  const [businessName, setBusinessName] = useState('');
  const [city, setCity] = useState('douala');
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? null;
  const suggestion = domainSuggestion(email);
  const pitch = PITCH[account];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Land where they were headed, or let the role decide (App routes "/").
        navigate(from ?? '/', { replace: true });
      } else if (mode === 'signup') {
        if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
          throw new Error("Those email addresses don't match — please check both.");
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              locale,
              // Migration 0013 only honours customer|vendor here — admin can
              // never be self-assigned.
              role: account,
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice('Check your inbox — confirm your email, then sign in.');
          return;
        }
        // A vendor also needs their business record before the area is usable.
        if (account === 'vendor') {
          await api('/vendors', {
            method: 'POST',
            body: JSON.stringify({
              business_name: businessName,
              city,
              contact_phone: phone || undefined,
            }),
          });
          navigate('/vendor', { replace: true });
          return;
        }
        navigate(from ?? '/', { replace: true });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/auth/reset',
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

  const accountTab = (a: Account, label: string, sub: string) => (
    <button
      type="button"
      onClick={() => {
        setAccount(a);
        setError(null);
      }}
      className={`flex-1 rounded-xl border-2 p-3 text-left transition ${
        account === a
          ? 'border-karu-gold bg-karu-yellow/10'
          : 'border-karu-ink/10 hover:border-karu-ink/25'
      }`}
    >
      <span className="block text-sm font-bold">{label}</span>
      <span className="mt-0.5 block text-xs text-karu-mute">{sub}</span>
    </button>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_420px] lg:items-start">
      {/* Why bother — the pitch changes with the account type. */}
      <div className="order-2 lg:order-1">
        <h1 className="font-display text-4xl font-bold leading-tight">{pitch.title}</h1>
        <p className="mt-2 text-karu-mute">{pitch.sub}</p>
        <ul className="mt-6 space-y-3">
          {pitch.points.map((p) => (
            <li key={p} className="flex gap-3 text-sm">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-karu-yellow text-xs font-bold text-karu-ink"
              >
                ✓
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
        {account === 'vendor' && (
          <div className="mt-6 rounded-xl bg-karu-cream p-4 text-sm">
            <p className="font-semibold">What happens after you sign up</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-karu-mute">
              <li>Upload your RCCM, carte grise and insurance</li>
              <li>We verify them — usually within one business day</li>
              <li>Add your cars and start receiving requests</li>
            </ol>
          </div>
        )}
      </div>

      <Card className="order-1 p-6 lg:order-2">
        <div className="mb-5 flex gap-2">
          {tab('login', 'Sign in')}
          {tab('signup', 'Create account')}
          {tab('reset', 'Reset password')}
        </div>

        {mode === 'signup' && (
          <div className="mb-5">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-karu-mute">
              Account type
            </span>
            <div className="flex gap-2">
              {accountTab('customer', "I'm renting a car", 'Book verified cars')}
              {accountTab('vendor', "I'm a provider", 'List your fleet')}
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <>
              {account === 'vendor' && (
                <>
                  <Field label="Business name">
                    <Input
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      required
                      placeholder="e.g. Douala Prestige Rentals"
                    />
                  </Field>
                  <Field label="City you operate in">
                    <Select value={city} onChange={(e) => setCity(e.target.value)}>
                      <option value="douala">Douala</option>
                      <option value="yaounde">Yaoundé</option>
                      <option value="other">Elsewhere in Cameroon</option>
                    </Select>
                  </Field>
                  <Field label="Business phone">
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+237 6 XX XX XX XX"
                    />
                  </Field>
                </>
              )}
              <Field label={account === 'vendor' ? 'Contact name' : 'Full name'}>
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
              {mode === 'signup' && (
                <span className="mt-1 block text-xs text-karu-mute">At least 8 characters.</span>
              )}
            </Field>
          )}

          {mode === 'signup' && (
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                required
                className="mt-0.5"
                style={{ accentColor: 'var(--gold-600)' }}
              />
              <span className="text-karu-mute">
                I agree to Karu&rsquo;s Terms of Service and Privacy Policy.
              </span>
            </label>
          )}

          {error && <ErrorNote>{error}</ErrorNote>}
          {notice && (
            <div className="rounded-lg border border-karu-gold/40 bg-karu-yellow/15 px-4 py-3 text-sm text-karu-brown">
              {notice}
            </div>
          )}

          <Button type="submit" disabled={busy || (mode === 'signup' && !agreed)} className="w-full">
            {busy
              ? 'One moment…'
              : mode === 'login'
                ? 'Sign in'
                : mode === 'signup'
                  ? account === 'vendor'
                    ? 'Create provider account'
                    : 'Create account'
                  : 'Send reset link'}
          </Button>

          <p className="text-center text-xs text-karu-mute">
            {mode === 'login' ? (
              <>
                Don&rsquo;t have an account?{' '}
                <button type="button" className="font-semibold underline" onClick={() => setMode('signup')}>
                  Sign up
                </button>
              </>
            ) : mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button type="button" className="font-semibold underline" onClick={() => setMode('login')}>
                  Sign in
                </button>
              </>
            ) : null}
          </p>
        </form>
      </Card>
    </div>
  );
}
