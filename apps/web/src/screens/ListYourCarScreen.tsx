import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import type { Vendor } from '@karu/shared';
import { api } from '../lib/api';
import { useAuth, useView } from '../lib/auth';
import { Button, Card, Field, Input, Select } from '../ds';
import { ErrorNote } from '../ui';

/**
 * The supply-side landing page. Supply is the marketplace's real bottleneck,
 * so providers get a proper pitch and a one-screen route in — rather than
 * having to sign up as a customer first and hunt for a form.
 */

export function ListYourCarScreen() {
  const { t } = useTranslation();
  const view = useView();
  const navigate = useNavigate();
  const reasons = t('listYourCar.reasons', { returnObjects: true }) as unknown as Array<{ title: string; body: string }>;
  const steps = t('listYourCar.steps', { returnObjects: true }) as unknown as Array<{ title: string; body: string }>;

  return (
    <div>
      <div
        style={{
          background: 'var(--bg-gradient)',
          borderRadius: 'var(--radius-lg)',
          padding: '48px 44px',
          color: 'var(--white)',
        }}
      >
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 46, maxWidth: 720 }}>
          {t('listYourCar.heroTitle')}
        </h1>
        <p
          style={{
            margin: '10px 0 0',
            fontFamily: 'var(--font-ui)',
            fontSize: 17,
            color: 'var(--text-on-dark-muted)',
            maxWidth: 620,
          }}
        >
          {t('listYourCar.heroSub')}
        </p>
        <div style={{ marginTop: 26, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {view === 'guest' && (
            <Button size="lg" onClick={() => navigate('/auth', { state: { from: '/vendor' } })}>
              {t('listYourCar.createAccount')}
            </Button>
          )}
          {view === 'customer' && (
            <Button size="lg" onClick={() => document.getElementById('convert')?.scrollIntoView({ behavior: 'smooth' })}>
              {t('listYourCar.registerBusiness')}
            </Button>
          )}
          {view === 'vendor' && (
            <Button size="lg" onClick={() => navigate('/vendor')}>
              {t('listYourCar.goToDashboard')}
            </Button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, marginTop: 28 }}>
        {reasons.map((r) => (
          <Card key={r.title}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 19 }}>{r.title}</h2>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 8, lineHeight: 1.55 }}>
              {r.body}
            </p>
          </Card>
        ))}
      </div>

      <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 26, margin: '36px 0 16px' }}>
        {t('listYourCar.howItWorks')}
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
        {steps.map((s, i) => (
          <Card key={s.title}>
            <span
              style={{
                display: 'inline-flex',
                width: 34,
                height: 34,
                borderRadius: '50%',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--yellow)',
                color: 'var(--ink)',
                fontFamily: 'var(--font-sans)',
                fontWeight: 800,
              }}
            >
              {i + 1}
            </span>
            <h3 style={{ margin: '12px 0 0', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 18 }}>
              {s.title}
            </h3>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 6, lineHeight: 1.55 }}>
              {s.body}
            </p>
          </Card>
        ))}
      </div>

      {view === 'customer' && <ConvertToVendor />}

      {view === 'guest' && (
        <Card style={{ marginTop: 28, textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 22 }}>
            {t('listYourCar.readyTitle')}
          </h2>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 6 }}>
            {t('listYourCar.readySub')}
          </p>
          <Button style={{ marginTop: 14 }} onClick={() => navigate('/auth', { state: { from: '/vendor' } })}>
            {t('listYourCar.createAccount')}
          </Button>
        </Card>
      )}
    </div>
  );
}

/** An existing customer upgrading their account, without signing up again. */
function ConvertToVendor() {
  const { t } = useTranslation();
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    business_name: '',
    city: 'douala',
    contact_phone: '',
    whatsapp_number: '',
    address: '',
    rccm_number: '',
  });
  const [declared, setDeclared] = useState(false);

  // If they already registered a business, don't offer it twice.
  const { data: existing } = useQuery({
    queryKey: ['vendor-me-check'],
    queryFn: () => api<Vendor>('/vendors/me').catch(() => null),
    retry: false,
  });

  const register = useMutation({
    mutationFn: () =>
      api<Vendor>('/vendors', {
        method: 'POST',
        body: JSON.stringify({
          business_name: form.business_name,
          city: form.city,
          contact_phone: form.contact_phone || undefined,
          whatsapp_number: form.whatsapp_number || undefined,
          address: form.address || undefined,
          rccm_number: form.rccm_number || undefined,
          declaration_accepted: declared,
        }),
      }),
    onSuccess: async () => {
      await refreshProfile();
      navigate('/vendor');
    },
  });

  if (existing) return null;

  return (
    <div id="convert">
    <Card style={{ marginTop: 28 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 22 }}>
        {t('listYourCar.registerBusiness')}
      </h2>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 6 }}>
        {t('listYourCar.convertSub')}
      </p>
      <form
        className="karu-form-grid"
        style={{ marginTop: 16 }}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          register.mutate();
        }}
      >
        <Field label={t('auth.businessName')}>
          <Input
            required
            value={form.business_name}
            onChange={(e) => setForm({ ...form, business_name: e.target.value })}
          />
        </Field>
        <Field label={t('search.city')}>
          <Select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
            <option value="douala">{t('city.douala')}</option>
            <option value="yaounde">{t('city.yaounde')}</option>
            <option value="other">Elsewhere in Cameroon</option>
          </Select>
        </Field>
        <Field label={t('auth.businessPhone')}>
          <Input
            value={form.contact_phone}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            placeholder="+237 6 XX XX XX XX"
          />
        </Field>
        <Field label={t('auth.whatsapp')}>
          <Input
            value={form.whatsapp_number}
            onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
            placeholder="+237 6 XX XX XX XX"
          />
        </Field>
        <Field label={t('auth.businessAddress')}>
          <Input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </Field>
        <Field label={t('auth.rccm')}>
          <Input
            value={form.rccm_number}
            onChange={(e) => setForm({ ...form, rccm_number: e.target.value })}
          />
        </Field>
        <label
          style={{
            gridColumn: '1 / -1',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            fontSize: 13,
            color: 'var(--gray-500)',
          }}
        >
          <input
            type="checkbox"
            required
            checked={declared}
            onChange={(e) => setDeclared(e.target.checked)}
            style={{ marginTop: 2, accentColor: 'var(--gold-600)' }}
          />
          <span>{t('auth.vendorDeclaration')}</span>
        </label>
        <div style={{ gridColumn: '1 / -1' }}>
          {register.isError && (
            <div style={{ marginBottom: 10 }}>
              <ErrorNote>{(register.error as Error).message}</ErrorNote>
            </div>
          )}
          <Button type="submit" disabled={register.isPending}>
            {register.isPending ? t('listYourCar.registering') : t('listYourCar.registerCta')}
          </Button>
        </div>
      </form>
    </Card>
    </div>
  );
}
