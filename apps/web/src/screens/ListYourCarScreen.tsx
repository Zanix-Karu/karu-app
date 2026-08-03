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

const STEPS = [
  {
    n: 1,
    title: 'Tell us about your business',
    body: 'Business name, city and a phone number. Two minutes.',
  },
  {
    n: 2,
    title: 'Send your documents',
    body: 'RCCM, carte grise and insurance. We check them within one business day.',
  },
  {
    n: 3,
    title: 'List your cars and take bookings',
    body: 'You set the price and availability. Accept only the requests you want.',
  },
];

const REASONS = [
  {
    title: 'You stay in control',
    body: 'Your price, your calendar, your decision on every request. Block dates whenever a car is unavailable.',
  },
  {
    title: 'We bring verified renters',
    body: 'Every customer has an account with us, and we handle the conversation — your phone number stays private.',
  },
  {
    title: 'No listing fee',
    body: 'Listing costs nothing. You only hear from us when someone wants your car.',
  },
  {
    title: 'Trust is the product',
    body: 'Verified providers are what customers come to Karu for. That badge is worth more than a cheap listing.',
  },
];

export function ListYourCarScreen() {
  const view = useView();
  const navigate = useNavigate();

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
          Your cars are earning nothing while they sit.
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
          List your fleet on Karu and reach renters across Douala and Yaoundé — including the
          diaspora booking ahead of landing.
        </p>
        <div style={{ marginTop: 26, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {view === 'guest' && (
            <Button size="lg" onClick={() => navigate('/auth', { state: { from: '/vendor' } })}>
              Create a provider account
            </Button>
          )}
          {view === 'customer' && (
            <Button size="lg" onClick={() => document.getElementById('convert')?.scrollIntoView({ behavior: 'smooth' })}>
              Register your business
            </Button>
          )}
          {view === 'vendor' && (
            <Button size="lg" onClick={() => navigate('/vendor')}>
              Go to your dashboard
            </Button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, marginTop: 28 }}>
        {REASONS.map((r) => (
          <Card key={r.title}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 19 }}>{r.title}</h2>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 8, lineHeight: 1.55 }}>
              {r.body}
            </p>
          </Card>
        ))}
      </div>

      <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 26, margin: '36px 0 16px' }}>
        How it works
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
        {STEPS.map((s) => (
          <Card key={s.n}>
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
              {s.n}
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
            Ready to list?
          </h2>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 6 }}>
            Creating a provider account takes about two minutes.
          </p>
          <Button style={{ marginTop: 14 }} onClick={() => navigate('/auth', { state: { from: '/vendor' } })}>
            Create a provider account
          </Button>
        </Card>
      )}
    </div>
  );
}

/** An existing customer upgrading their account, without signing up again. */
function ConvertToVendor() {
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ business_name: '', city: 'douala', contact_phone: '' });

  // If they already registered a business, don't offer it twice.
  const { data: existing } = useQuery({
    queryKey: ['vendor-me-check'],
    queryFn: () => api<Vendor>('/vendors/me').catch(() => null),
    retry: false,
  });

  const register = useMutation({
    mutationFn: () => api<Vendor>('/vendors', { method: 'POST', body: JSON.stringify(form) }),
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
        Register your business
      </h2>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 6 }}>
        You&rsquo;re already signed in — this adds a provider side to your account. You can still
        book cars as a customer.
      </p>
      <form
        className="karu-form-grid"
        style={{ marginTop: 16 }}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          register.mutate();
        }}
      >
        <Field label="Business name">
          <Input
            required
            value={form.business_name}
            onChange={(e) => setForm({ ...form, business_name: e.target.value })}
          />
        </Field>
        <Field label="City">
          <Select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
            <option value="douala">Douala</option>
            <option value="yaounde">Yaoundé</option>
            <option value="other">Elsewhere in Cameroon</option>
          </Select>
        </Field>
        <Field label="Business phone" style={{ gridColumn: '1 / -1' }}>
          <Input
            value={form.contact_phone}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            placeholder="+237 6 XX XX XX XX"
          />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          {register.isError && (
            <div style={{ marginBottom: 10 }}>
              <ErrorNote>{(register.error as Error).message}</ErrorNote>
            </div>
          )}
          <Button type="submit" disabled={register.isPending}>
            {register.isPending ? 'Registering…' : 'Register as a provider'}
          </Button>
        </div>
      </form>
    </Card>
    </div>
  );
}
