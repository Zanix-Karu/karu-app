import { useTranslation } from 'react-i18next';
import { usePageMeta } from '../lib/page-meta';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import type { Vendor } from '@karu/shared';
import { api } from '../lib/api';
import { useAuth, useView } from '../lib/auth';
import { Button, Card, Field, Input, Select } from '../ds';
import { ErrorNote } from '../ui';
import { Checkbox } from '../components/Controls';
import { FadeIn } from '../components/motion/FadeIn';

/**
 * The supply-side landing page. Supply is the marketplace's real bottleneck,
 * so providers get a proper pitch and a one-screen route in — rather than
 * having to sign up as a customer first and hunt for a form.
 */

export function ListYourCarScreen() {
  const { t } = useTranslation();
  usePageMeta({
    title: t('seo.listYourCar.title'),
    description: t('seo.listYourCar.description'),
  });
  const view = useView();
  const navigate = useNavigate();
  const reasons = t('listYourCar.reasons', { returnObjects: true }) as unknown as Array<{ title: string; body: string }>;
  const steps = t('listYourCar.steps', { returnObjects: true }) as unknown as Array<{ title: string; body: string }>;

  return (
    <div>
      <section className="pt-2 sm:pt-6">
        <span className="headline-in inline-flex items-center gap-2 rounded-full bg-brand-tint px-3.5 py-1.5 text-sm font-semibold text-slate-900">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
          {t('nav.listYourCar')}
        </span>
        <h1 className="headline-in mt-5 max-w-3xl font-display text-4xl font-bold leading-[1.08] tracking-tight text-slate-900 sm:text-[3.25rem]">
          {t('listYourCar.heroTitle')}
        </h1>
        <p className="headline-in-2 mt-5 max-w-xl text-lg leading-relaxed text-slate-600">{t('listYourCar.heroSub')}</p>
        <div className="headline-in-2 mt-8 flex flex-wrap items-center gap-3">
          {view === 'guest' && (
            <Button size="lg" onClick={() => navigate('/auth', { state: { from: '/vendor', mode: 'signup', account: 'vendor' } })}>
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
      </section>

      <FadeIn className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {reasons.map((r) => (
          <Card key={r.title} className="transition-[transform,box-shadow] duration-250 ease-[var(--ease-smooth-out)] hover:-translate-y-[3px] hover:shadow-lg">
            <h2 className="font-display text-lg font-bold tracking-tight text-slate-900">{r.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{r.body}</p>
          </Card>
        ))}
      </FadeIn>

      <FadeIn className="mt-16">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-text">
          <span className="h-px w-6 bg-accent" aria-hidden="true" />
          {t('listYourCar.howItWorks')}
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step, i) => (
            <Card key={step.title}>
              <span className="block font-display text-3xl font-bold leading-none tracking-tight text-accent">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-4 font-display text-lg font-bold tracking-tight text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
            </Card>
          ))}
        </div>
      </FadeIn>

      {view === 'customer' && <ConvertToVendor />}

      {view === 'guest' && (
        <FadeIn className="mt-16 flex flex-col gap-4 rounded-2xl bg-brand-tint p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">{t('listYourCar.readyTitle')}</h2>
            <p className="mt-1 text-sm text-slate-600">{t('listYourCar.readySub')}</p>
          </div>
          <Button className="self-start sm:self-auto" onClick={() => navigate('/auth', { state: { from: '/vendor', mode: 'signup', account: 'vendor' } })}>
            {t('listYourCar.createAccount')}
          </Button>
        </FadeIn>
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
    <Card style={{ marginTop: 32 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 22 }}>
        {t('listYourCar.registerBusiness')}
      </h2>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 4 }}>
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
          <Checkbox
            required
            checked={declared}
            onChange={(e) => setDeclared(e.target.checked)}
            wrapperClassName="-my-3 -ml-3 -mr-1"
          />
          <span>{t('auth.vendorDeclaration')}</span>
        </label>
        <div style={{ gridColumn: '1 / -1' }}>
          {register.isError && (
            <div style={{ marginBottom: 12 }}>
              <ErrorNote>{(register.error as Error).message}</ErrorNote>
            </div>
          )}
          <Button type="submit" loading={register.isPending}>
            {register.isPending ? t('listYourCar.registering') : t('listYourCar.registerCta')}
          </Button>
        </div>
      </form>
    </Card>
    </div>
  );
}
