import { useState, type FormEvent } from 'react';
import { usePageMeta } from '../lib/page-meta';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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

export function AuthScreen() {
  const { t } = useTranslation();
  usePageMeta({ title: t('seo.auth.title'), noindex: true });
  // A caller can say which tab it meant. "List your car" sends a provider to
  // signup-as-vendor; without this they landed on the login tab as a customer
  // — a login wall in front of the one action the page exists to start.
  const intent = (useLocation().state ?? null) as {
    from?: string;
    mode?: Mode;
    account?: Account;
  } | null;
  const [mode, setMode] = useState<Mode>(intent?.mode ?? 'login');
  const [account, setAccount] = useState<Account>(intent?.account ?? 'customer');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [locale, setLocale] = useState<'en' | 'fr'>('en');
  const [businessName, setBusinessName] = useState('');
  const [city, setCity] = useState('douala');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [address, setAddress] = useState('');
  const [rccm, setRccm] = useState('');
  const [declared, setDeclared] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = useNavigate();
  const from = intent?.from ?? null;
  const suggestion = domainSuggestion(email);
  const pitch = {
    title: t(`auth.${account}Title`),
    sub: t(`auth.${account}Sub`),
    points: t(`auth.${account}Points`, { returnObjects: true }) as unknown as string[],
  };

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
          throw new Error(t('auth.emailsDontMatch'));
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
        // With email confirmation on (production), signUp() returns no session,
        // so the POST /vendors below never runs and the business details typed
        // above are discarded. Rather than pretend otherwise, tell a provider
        // what to expect; VendorAreaScreen then walks them through entering the
        // details once they are confirmed and signed in.
        if (!data.session) {
          setNotice(t(account === 'vendor' ? 'auth.checkInboxVendor' : 'auth.checkInbox'));
          return;
        }
        // A vendor also needs their business record before the area is usable.
        if (account === 'vendor') {
          await api('/vendors', {
            method: 'POST',
            body: JSON.stringify({
              business_name: businessName,
              city,
              contact_person: fullName || undefined,
              contact_phone: phone || undefined,
              whatsapp_number: whatsapp || undefined,
              address: address || undefined,
              rccm_number: rccm || undefined,
              declaration_accepted: declared,
              // The account email doubles as the business contact email until
              // the provider sets a different one from their dashboard.
              contact_email: email,
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
        setNotice(t('auth.resetSent'));
      }
    } catch (err) {
      // Auth failures sometimes surface a raw body ("{}") or nothing at all —
      // a person retrying their password deserves words, not JSON.
      const message = (err as Error).message?.trim();
      setError(message && message !== '{}' ? message : t('auth.genericError'));
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
            <p className="font-semibold">{t('auth.afterSignup')}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-karu-mute">
              {(t('auth.afterSignupSteps', { returnObjects: true }) as unknown as string[]).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <Card className="order-1 p-6 lg:order-2">
        <div className="mb-5 flex gap-2">
          {tab('login', t('common.signIn'))}
          {tab('signup', t('auth.createAccount'))}
          {tab('reset', t('auth.resetPassword'))}
        </div>

        {mode === 'signup' && (
          <div className="mb-5">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-karu-mute">
              {t('auth.accountType')}
            </span>
            <div className="flex gap-2">
              {accountTab('customer', t('auth.imRenting'), t('auth.imRentingSub'))}
              {accountTab('vendor', t('auth.imProvider'), t('auth.imProviderSub'))}
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <>
              {account === 'vendor' && (
                <>
                  <Field label={t('auth.businessName')}>
                    <Input
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      required
                      placeholder="e.g. Douala Prestige Rentals"
                    />
                  </Field>
                  <Field label={t('auth.cityOperate')}>
                    <Select value={city} onChange={(e) => setCity(e.target.value)}>
                      <option value="douala">{t('city.douala')}</option>
                      <option value="yaounde">{t('city.yaounde')}</option>
                      <option value="other">Elsewhere in Cameroon</option>
                    </Select>
                  </Field>
                  <Field label={t('auth.businessPhone')}>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+237 6 XX XX XX XX"
                    />
                  </Field>
                  <Field label={t('auth.whatsapp')}>
                    <Input
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="+237 6 XX XX XX XX"
                    />
                    <span className="mt-1 block text-xs text-karu-mute">{t('auth.whatsappHint')}</span>
                  </Field>
                  <Field label={t('auth.businessAddress')}>
                    <Input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. Akwa, Rue Joffre"
                    />
                  </Field>
                  <Field label={t('auth.rccm')}>
                    <Input value={rccm} onChange={(e) => setRccm(e.target.value)} />
                    <span className="mt-1 block text-xs text-karu-mute">{t('auth.rccmHint')}</span>
                  </Field>
                </>
              )}
              <Field label={account === 'vendor' ? t('auth.contactName') : t('auth.fullName')}>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </Field>
              <Field label={t('auth.preferredLanguage')}>
                <Select value={locale} onChange={(e) => setLocale(e.target.value as 'en' | 'fr')}>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </Select>
              </Field>
            </>
          )}

          <Field label={t('auth.email')}>
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
              {t('auth.didYouMean')}{' '}
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
            <Field label={t('auth.confirmEmail')}>
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
            <Field label={t('auth.password')}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              {mode === 'signup' && (
                <span className="mt-1 block text-xs text-karu-mute">{t('auth.passwordHint')}</span>
              )}
            </Field>
          )}

          {mode === 'signup' && account === 'vendor' && (
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={declared}
                onChange={(e) => setDeclared(e.target.checked)}
                required
                className="mt-0.5"
                style={{ accentColor: 'var(--gold-600)' }}
              />
              <span className="text-karu-mute">
                {t('auth.vendorDeclaration')}
              </span>
            </label>
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
                <Trans
                  i18nKey="auth.agree"
                  components={{
                    terms: <Link to="/terms" target="_blank" className="underline" />,
                    privacy: <Link to="/privacy" target="_blank" className="underline" />,
                  }}
                />
              </span>
            </label>
          )}

          {error && <ErrorNote>{error}</ErrorNote>}
          {notice && (
            <div className="rounded-lg border border-karu-gold/40 bg-karu-yellow/15 px-4 py-3 text-sm text-karu-brown">
              {notice}
            </div>
          )}

          <Button
            type="submit"
            disabled={busy || (mode === 'signup' && (!agreed || (account === 'vendor' && !declared)))}
            className="w-full"
          >
            {busy
              ? t('common.oneMoment')
              : mode === 'login'
                ? t('common.signIn')
                : mode === 'signup'
                  ? account === 'vendor'
                    ? t('auth.createProviderAccount')
                    : t('auth.createAccount')
                  : t('auth.sendResetLink')}
          </Button>

          <p className="text-center text-xs text-karu-mute">
            {mode === 'login' ? (
              <>
                {t('auth.noAccount')}{' '}
                <button type="button" className="font-semibold underline" onClick={() => setMode('signup')}>
                  {t('auth.signUp')}
                </button>
              </>
            ) : mode === 'signup' ? (
              <>
                {t('auth.haveAccount')}{' '}
                <button type="button" className="font-semibold underline" onClick={() => setMode('login')}>
                  {t('common.signIn')}
                </button>
              </>
            ) : null}
          </p>
        </form>
      </Card>
    </div>
  );
}
