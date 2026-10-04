import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CustomerDocumentType, CustomerVerificationStatus } from '@karu/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, ErrorNote, Field, Input } from '../ui';

interface MyVerification {
  status: CustomerVerificationStatus;
  note: string | null;
  verified_at: string | null;
  date_of_birth: string | null;
  licence_expires_at: string | null;
  documents: Array<{ type: CustomerDocumentType; updated_at: string }>;
  missing: string[];
}

/** The slots, in the order a person would naturally photograph them. */
const SLOTS: Array<{ type: CustomerDocumentType; capture?: 'user' | 'environment' }> = [
  { type: 'licence_front', capture: 'environment' },
  { type: 'licence_back', capture: 'environment' },
  { type: 'national_id', capture: 'environment' },
  { type: 'passport', capture: 'environment' },
  { type: 'selfie', capture: 'user' },
];

const TONE: Record<CustomerVerificationStatus, string> = {
  unverified: 'bg-karu-ink/5 text-karu-ink',
  pending: 'bg-karu-yellow/25 text-karu-brown',
  verified: 'bg-green-50 text-green-800',
  rejected: 'bg-karu-terracotta/10 text-karu-terracotta',
};

/**
 * Customer ID check (0032). Self-drive bookings can only be accepted once it
 * is done, so this card says plainly what is still needed and why.
 */
export function VerifyIdentity() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { refreshProfile } = useAuth();
  const { data, error } = useQuery({
    queryKey: ['verification-me'],
    queryFn: () => api<MyVerification>('/verification/me'),
  });
  const [dob, setDob] = useState('');
  const [expiry, setExpiry] = useState('');

  useEffect(() => {
    if (data) {
      setDob(data.date_of_birth ?? '');
      setExpiry(data.licence_expires_at ?? '');
    }
  }, [data]);

  // Arriving from a booking's "Verify my ID" link lands on this card.
  const loaded = Boolean(data);
  useEffect(() => {
    if (loaded && window.location.hash === '#verify') {
      document.getElementById('verify')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loaded]);

  const upload = useMutation({
    mutationFn: async ({ type, file }: { type: CustomerDocumentType; file: File }) => {
      const res = await api<{ signedUrl: string; path: string }>('/verification/documents/upload', {
        method: 'POST',
        body: JSON.stringify({ type, file_name: file.name }),
      });
      const put = await fetch(res.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) throw new Error(t('verify.uploadFailed'));
      return api<MyVerification>('/verification/documents', {
        method: 'POST',
        body: JSON.stringify({ type, path: res.path }),
      });
    },
    onSuccess: (next) => qc.setQueryData(['verification-me'], next),
  });

  const submit = useMutation({
    mutationFn: () =>
      api<MyVerification>('/verification/submit', {
        method: 'POST',
        body: JSON.stringify({ date_of_birth: dob, licence_expires_at: expiry }),
      }),
    onSuccess: async (next) => {
      qc.setQueryData(['verification-me'], next);
      await refreshProfile();
    },
  });

  if (error) return <ErrorNote>{(error as Error).message}</ErrorNote>;
  if (!data) return null;

  const onFile = new Set(data.documents.map((d) => d.type));
  const docsMissing = data.missing.filter((m) => m !== 'date_of_birth' && m !== 'licence_expiry');
  const locked = data.status === 'pending' || data.status === 'verified';

  return (
    <div id="verify">
      <Card className="mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">{t('verify.title')}</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONE[data.status]}`}>
            {t(`verify.status.${data.status}`)}
          </span>
        </div>
        <p className="mt-1 text-sm text-karu-mute">{t(`verify.intro.${data.status}`)}</p>
        {data.status === 'rejected' && data.note && (
          <p className="mt-2 rounded-lg bg-karu-terracotta/10 px-3 py-2 text-sm text-karu-terracotta">
            {data.note}
          </p>
        )}

        {data.status !== 'verified' && (
          <>
            <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SLOTS.map(({ type, capture }) => {
                const done = onFile.has(type);
                const busy = upload.isPending && upload.variables?.type === type;
                return (
                  <li key={type}>
                    <label
                      className={`flex h-full cursor-pointer flex-col justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                        done ? 'border-green-600/40 bg-green-50' : 'border-dashed border-karu-ink/25 hover:bg-karu-ink/5'
                      } ${locked ? 'pointer-events-none opacity-60' : ''}`}
                    >
                      <span className="font-semibold">{t(`verify.doc.${type}`)}</span>
                      <span className={`mt-1 text-xs ${done ? 'text-green-700' : 'text-karu-mute'}`}>
                        {busy ? t('common.oneMoment') : done ? t('verify.onFile') : t('verify.add')}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        capture={capture}
                        className="sr-only"
                        disabled={locked || upload.isPending}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) upload.mutate({ type, file });
                        }}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-karu-mute">{t('verify.idHint')}</p>

            {!locked && (
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit.mutate();
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('verify.dob')}>
                    <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
                  </Field>
                  <Field label={t('verify.licenceExpiry')}>
                    <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} required />
                  </Field>
                </div>
                {docsMissing.length > 0 && (
                  <p className="text-xs text-karu-mute">
                    {t('verify.stillNeeded', {
                      list: docsMissing.map((m) => t(`verify.doc.${m}`)).join(', '),
                    })}
                  </p>
                )}
                <Button type="submit" disabled={docsMissing.length > 0 || !dob || !expiry || submit.isPending}>
                  {submit.isPending ? t('common.saving') : t('verify.submit')}
                </Button>
              </form>
            )}
          </>
        )}

        {(upload.isError || submit.isError) && (
          <div className="mt-3">
            <ErrorNote>{((upload.error ?? submit.error) as Error).message}</ErrorNote>
          </div>
        )}
        <p className="mt-4 text-xs text-karu-mute">{t('verify.privacy')}</p>
      </Card>
    </div>
  );
}
