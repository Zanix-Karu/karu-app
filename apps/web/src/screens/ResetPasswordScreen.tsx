import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button, Card, ErrorNote, Field, Input } from '../ui';
import { Spinner } from '../ui';

/**
 * Completes a password reset. Supabase sends the user here with a recovery
 * token in the URL fragment; supabase-js consumes it and emits a
 * PASSWORD_RECOVERY event, at which point the session is valid just long
 * enough to set a new password.
 *
 * Without this screen the reset email led back to the sign-in form with no
 * way to actually change anything — the flow dead-ended.
 */
export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // The recovery session may already be established by the time we mount,
    // or arrive moments later once the fragment is parsed.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('auth.passwordsDontMatch'));
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate('/', { replace: true }), 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="font-display text-3xl font-bold">{t('auth.passwordUpdated')}</h1>
        <p className="mt-2 text-sm text-karu-mute">{t('auth.signingYouIn')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-3xl font-bold">{t('auth.chooseNewPassword')}</h1>

      {!ready ? (
        <Card className="mt-6 p-6">
          <Spinner label={t('auth.checkingResetLink')} />
          <p className="text-center text-xs text-karu-mute">{t('auth.resetLinkExpiredHint')}</p>
        </Card>
      ) : (
        <Card className="mt-6 p-6">
          <form onSubmit={submit} className="space-y-4">
            <Field label={t('auth.newPassword')}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
            <Field label={t('auth.confirmNewPassword')}>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? t('common.saving') : t('auth.updatePassword')}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
