import { useState, type CSSProperties, type FormEvent } from 'react';
import { ReviewBody } from '../components/ReviewBody';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  missingPhotoAngles,
  primaryPhoto,
  type Booking,
  type BookingStatus,
  type Review,
  type Vehicle,
  type Vendor,
  type VendorDocument,
} from '@karu/shared';
import { api } from '../lib/api';
import { useView } from '../lib/auth';
import { CATEGORY_LABEL, CITY_LABEL, prettyDate, xaf } from '../lib/format';
import { Badge, Button, Card, Field, Input, Rating, Select, SidebarNav, StatCard, StepNav } from '../ds';
import { EarningsChart } from '../components/EarningsChart';
import { ConfirmButton } from '../components/ConfirmButton';
import { PhotoStrip } from '../components/PhotoStrip';
import { PhotoSlots, extraPhotos } from '../components/PhotoSlots';
import { Skeleton, SkeletonCard, SkeletonStats } from '../components/Skeleton';
import { EmptyState, ErrorNote, Spinner, StatusBadge } from '../ui';

interface VendorStats {
  earningsXaf: number;
  completedCount: number;
  requestedCount: number;
  upcomingCount: number;
  responseRate: number | null;
  decidedCount: number;
  fleet: { total: number; available: number; booked: number; unavailable: number };
  earningsSeries: Array<{ day: string; xaf: number }>;
}

type Section = 'dashboard' | 'bookings' | 'cars' | 'documents';

const NAV = [
  { key: 'dashboard', label: 'vendor.nav.dashboard', path: '/vendor' },
  { key: 'bookings', label: 'vendor.nav.bookings', path: '/vendor/bookings' },
  { key: 'cars', label: 'vendor.nav.cars', path: '/vendor/cars' },
  { key: 'documents', label: 'vendor.nav.documents', path: '/vendor/documents' },
];

/** Section is derived from the URL so the rail, header nav and page agree. */
function sectionFromPath(pathname: string): Section {
  if (pathname.startsWith('/vendor/bookings')) return 'bookings';
  if (pathname.startsWith('/vendor/cars')) return 'cars';
  if (pathname.startsWith('/vendor/documents')) return 'documents';
  return 'dashboard';
}

export function VendorAreaScreen() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const view = useView();
  const section = sectionFromPath(location.pathname);
  const isAdmin = view === 'admin';
  const [asVendorId, setAsVendorId] = useState<string>('');

  // A vendor has their own record. An admin has none, so they pick whose area
  // to inspect — a superadmin can see every provider's dashboard.
  const { data: vendor, isLoading, error } = useQuery({
    queryKey: ['vendor-me'],
    queryFn: () => api<Vendor>('/vendors/me'),
    enabled: !isAdmin,
  });
  const { data: allVendors } = useQuery({
    queryKey: ['admin-vendors', ''],
    queryFn: () => api<Vendor[]>('/admin/vendors'),
    enabled: isAdmin,
  });

  const active = isAdmin ? allVendors?.find((v) => v.id === asVendorId) : vendor;

  if (!isAdmin && isLoading) return <Spinner label={t('vendor.loading')} />;

  // A provider with no vendors row is not an error to shout about — it is the
  // predictable end state of signing up while email confirmation is on: the
  // business details typed at signup are dropped when signUp() returns no
  // session, so the account exists with role=vendor and nothing else. Send them
  // to the registration form instead of a raw API message.
  if (!isAdmin && error) {
    const missingRecord = /no vendor for this account/i.test((error as Error).message ?? '');
    if (!missingRecord) return <ErrorNote>{(error as Error).message}</ErrorNote>;
    return (
      <Card style={{ maxWidth: 560 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 26 }}>
          {t('vendor.noRecordTitle')}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--gray-500)',
            marginTop: 10,
          }}
        >
          {t('vendor.noRecordBody')}
        </p>
        <Button style={{ marginTop: 16 }} onClick={() => navigate('/list-your-car#convert')}>
          {t('vendor.noRecordCta')}
        </Button>
      </Card>
    );
  }

  if (isAdmin && !active) {
    return (
      <div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 32 }}>
          {t('vendor.providerArea')}
        </h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 6 }}>
          {t('vendor.adminPick')}
        </p>
        <Card style={{ marginTop: 18, maxWidth: 420 }}>
          <Field label={t('vendor.provider')}>
            <Select value={asVendorId} onChange={(e) => setAsVendorId(e.target.value)}>
              <option value="">{t('vendor.chooseProvider')}</option>
              {allVendors?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.business_name} ({t(`vendor.status.${v.status}`)})
                </option>
              ))}
            </Select>
          </Field>
        </Card>
      </div>
    );
  }
  if (!active) return null;

  return (
    <div className="karu-vendor-layout">
      <div
        className="karu-vendor-rail"
        style={{
          background: 'var(--bg-gradient)',
          borderRadius: 'var(--radius-lg)',
          padding: 20,
          position: 'sticky',
          top: 90,
        }}
      >
        <div style={{ padding: '4px 18px 16px' }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 18, color: 'var(--white)' }}>
            {active.business_name}
          </div>
          <Badge variant={active.status === 'verified' ? 'success' : 'upcoming'} style={{ marginTop: 8 }}>
            {active.status === 'verified'
              ? t('vendor.verifiedBadge')
              : t('vendor.verificationStatus', { status: t(`vendor.status.${active.status}`) })}
          </Badge>
          {isAdmin && (
            <button
              onClick={() => setAsVendorId('')}
              style={{ display: 'block', marginTop: 10, background: 'none', border: 'none', padding: 0,
                cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--yellow)', textDecoration: 'underline' }}
            >
              {t('vendor.switchProvider')}
            </button>
          )}
        </div>
        <SidebarNav
          items={NAV.map((n) => ({ ...n, label: t(n.label) }))}
          active={section}
          onSelect={(k) => navigate(NAV.find((n) => n.key === k)!.path)}
        />
      </div>

      <div>
        {active.status !== 'verified' && !isAdmin && <Onboarding vendor={active} onGo={navigate} />}
        {/*
          When an admin is viewing a provider, every tab is scoped to that
          provider: an unscoped `/vehicles/mine` would show all six cars on the
          platform under one provider's name, which reads as their fleet.
        */}
        {section === 'dashboard' && <Dashboard vendor={active} asAdmin={isAdmin} />}
        {section === 'bookings' && <VendorBookings asVendorId={isAdmin ? active.id : undefined} />}
        {section === 'cars' && (
          <Cars vendorVerified={active.status === 'verified'} asVendorId={isAdmin ? active.id : undefined} />
        )}
        {section === 'documents' && <Documents asVendor={isAdmin ? active : undefined} />}
      </div>
    </div>
  );
}

/**
 * What a new provider should do next. A pending vendor otherwise lands on an
 * empty dashboard with a grey badge and no idea what is expected of them.
 */
function Onboarding({ vendor, onGo }: { vendor: Vendor; onGo: (to: string) => void }) {
  const { t } = useTranslation();
  const { data: cars } = useQuery({
    queryKey: ['my-cars'],
    queryFn: () => api<Vehicle[]>('/vehicles/mine'),
  });
  const { data: myDocs } = useQuery({
    queryKey: ['vendor-docs', 'me'],
    queryFn: () => api<VendorDocument[]>('/vendors/me/documents'),
  });

  // One business/identity document unblocks review; car paperwork is asked
  // for per car on the Documents page and doesn't hold this step hostage.
  const identityTypes: VendorDocument['type'][] = ['rccm', 'national_id', 'passport'];
  const docsUploaded = myDocs?.some((d) => identityTypes.includes(d.type)) ?? false;
  const rejectedDocs = myDocs?.filter((d) => d.status === 'rejected') ?? [];

  const rejected = vendor.status === 'rejected' || vendor.status === 'suspended';
  const steps = [
    {
      done: true,
      title: t('vendor.onboarding.step1'),
      body: `${vendor.business_name} · ${CITY_LABEL[vendor.city]}`,
      action: null as null | { label: string; to: string },
    },
    {
      done: docsUploaded && rejectedDocs.length === 0,
      title: t('vendor.onboarding.step2'),
      body: rejectedDocs.length
        ? t('vendor.onboarding.step2Rejected', { count: rejectedDocs.length })
        : t('vendor.onboarding.step2Body'),
      action: {
        label: rejectedDocs.length ? t('vendor.onboarding.fixDocuments') : t('vendor.onboarding.uploadDocuments'),
        to: '/vendor/documents',
      },
    },
    {
      done: (cars?.length ?? 0) > 0,
      title: t('vendor.onboarding.step3'),
      body:
        (cars?.length ?? 0) > 0
          ? t('vendor.onboarding.step3Done', { count: cars!.length })
          : t('vendor.onboarding.step3Body'),
      action: { label: t('vendor.addCar'), to: '/vendor/cars' },
    },
  ];

  return (
    <Card style={{ marginBottom: 24, borderLeft: '4px solid var(--yellow)' }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 22 }}>
        {rejected ? t('vendor.onboarding.titleAttention') : t('vendor.onboarding.titleOk')}
      </h2>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 6 }}>
        {rejected
          ? t('vendor.onboarding.subAttention', { status: t(`vendor.status.${vendor.status}`) })
          : t('vendor.onboarding.subOk')}
      </p>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {steps.map((st, i) => (
          <div key={st.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span
              aria-hidden="true"
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-ui)',
                fontWeight: 700,
                fontSize: 13,
                background: st.done ? 'var(--success)' : 'var(--cream-200)',
                color: st.done ? 'var(--white)' : 'var(--gray-500)',
              }}
            >
              {st.done ? '✓' : i + 1}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15 }}>{st.title}</div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>
                {st.body}
              </div>
            </div>
            {st.action && (
              <Button size="sm" variant="outline" onClick={() => onGo(st.action!.to)}>
                {st.action.label}
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// --- Dashboard ----------------------------------------------------------------

/**
 * Delivery pricing, set once by the provider rather than per car.
 *
 * A blank fee means the service isn't offered, and the car page hides that
 * option entirely — so an empty field here is a real answer, not missing data.
 */
function DeliverySettings({ vendor }: { vendor: Vendor }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [delivery, setDelivery] = useState(vendor.delivery_fee_xaf?.toString() ?? '');
  const [airport, setAirport] = useState(vendor.airport_fee_xaf?.toString() ?? '');

  const save = useMutation({
    mutationFn: () =>
      api<Vendor>('/vendors/me', {
        method: 'PATCH',
        body: JSON.stringify({
          delivery_fee_xaf: delivery === '' ? null : Number(delivery),
          airport_fee_xaf: airport === '' ? null : Number(airport),
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-me'] }),
  });

  return (
    <>
      <h2 style={{ margin: '32px 0 14px', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 22 }}>
        {t('vendor.delivery.title')}
      </h2>
      <Card>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', margin: '0 0 14px' }}>
          {t('vendor.delivery.sub')}
        </p>
        <div className="karu-form-grid">
          <Field label={t('vendor.delivery.airport')}>
            <Input
              type="number"
              min={0}
              value={airport}
              onChange={(e) => setAirport(e.target.value)}
              placeholder={t('vendor.delivery.notOffered')}
            />
          </Field>
          <Field label={t('vendor.delivery.address')}>
            <Input
              type="number"
              min={0}
              value={delivery}
              onChange={(e) => setDelivery(e.target.value)}
              placeholder={t('vendor.delivery.notOffered')}
            />
          </Field>
        </div>
        <Button size="sm" style={{ marginTop: 14 }} disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t('vendor.saving') : t('vendor.delivery.save')}
        </Button>
        {save.isError && <div style={{ marginTop: 10 }}><ErrorNote>{(save.error as Error).message}</ErrorNote></div>}
        {save.isSuccess && (
          <span style={{ marginLeft: 12, fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--success)' }}>
            {t('vendor.saved')}
          </span>
        )}
      </Card>
    </>
  );
}

function Dashboard({ vendor, asAdmin = false }: { vendor: Vendor; asAdmin?: boolean }) {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useQuery({
    queryKey: ['vendor-stats', vendor.id, asAdmin],
    queryFn: () =>
      api<VendorStats>(asAdmin ? `/admin/vendors/${vendor.id}/stats` : '/vendors/me/stats'),
  });
  /**
   * The provider's own threads. Until now a provider had no way to notice a
   * customer had written without opening each booking in turn, which on a
   * marketplace with a 24h reply window is the difference between answering
   * and losing the booking. Admin-as-vendor is a read-only impersonation and
   * has its own console, so this is skipped there.
   */
  const { data: conversations } = useQuery({
    queryKey: ['vendor-conversations'],
    queryFn: () =>
      api<
        Array<{
          booking_id: string;
          reference: string | null;
          customer_name: string;
          unread_count: number;
          assistance_open: boolean;
        }>
      >('/messages/vendor/conversations'),
    enabled: !asAdmin,
  });

  const { data: bookings } = useQuery({
    // As an admin, /bookings/mine returns every booking on the platform, so the
    // upcoming-trips panel has to be narrowed to the provider being viewed.
    queryKey: ['my-bookings', asAdmin ? vendor.id : 'self'],
    queryFn: async () => {
      const all = await api<Booking[]>('/bookings/mine');
      return asAdmin ? all.filter((b) => b.vendor_id === vendor.id) : all;
    },
  });
  const { data: reviews } = useQuery({
    queryKey: ['vendor-reviews', vendor.id],
    queryFn: () => api<Review[]>(`/vendors/${vendor.id}/reviews`),
  });
  // REQ-12: insurance, carte grise and roadworthiness lapse quietly once a
  // document is approved — nothing else re-checks expires_at afterwards.
  const { data: documents } = useQuery({
    queryKey: ['vendor-docs', 'expiry', vendor.id, asAdmin],
    queryFn: () =>
      api<VendorDocument[]>(asAdmin ? `/admin/vendors/${vendor.id}/documents` : '/vendors/me/documents'),
  });

  if (isLoading || !stats) {
    return (
      <div>
        <Skeleton width="45%" height={32} />
        <div style={{ marginTop: 20 }}>
          <SkeletonStats />
        </div>
      </div>
    );
  }

  const upcoming = (bookings ?? [])
    .filter((b) => b.status === 'confirmed' || b.status === 'in_progress')
    .slice(0, 5);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? t('vendor.greeting.morning') : hour < 18 ? t('vendor.greeting.afternoon') : t('vendor.greeting.evening');

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 32 }}>
          {greeting}, {vendor.business_name}
        </h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to={`/vendors/${vendor.id}`}>
            <Button size="sm" variant="outline">{t('vendor.viewPublicProfile')}</Button>
          </Link>
          <Link to="/vendor/cars">
            <Button size="sm">{t('vendor.addCar')}</Button>
          </Link>
        </div>
      </div>

      {(() => {
        const unread = (conversations ?? []).filter((c) => c.unread_count > 0);
        const escalated = (conversations ?? []).filter((c) => c.assistance_open);
        const pending = (bookings ?? []).filter((b) => b.status === 'requested');
        // REQ-12: mirrors the API's DOC_EXPIRY_WARNING_DAYS (admin.service.ts)
        // — a rejected document isn't the operative one, a replacement is
        // expected, so it doesn't count here either.
        const DOC_EXPIRY_WARNING_DAYS = 30;
        const now = Date.now();
        const warnBy = now + DOC_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000;
        const live = (documents ?? []).filter((d) => d.expires_at && d.status !== 'rejected');
        const expiredDocs = live.filter((d) => new Date(d.expires_at!).getTime() < now);
        const expiringDocs = live.filter((d) => {
          const t = new Date(d.expires_at!).getTime();
          return t >= now && t <= warnBy;
        });
        if (
          unread.length === 0 &&
          escalated.length === 0 &&
          pending.length === 0 &&
          expiredDocs.length === 0 &&
          expiringDocs.length === 0
        )
          return null;
        return (
          <Card style={{ marginTop: 20, borderLeft: '4px solid var(--brand)' }}>
            <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 15 }}>
              {t('vendor.attention.title')}
            </p>
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)' }}>
              {pending.length > 0 && (
                <li>
                  <Link to="/vendor/bookings">
                    {t('vendor.attention.pending', { count: pending.length })}
                  </Link>
                </li>
              )}
              {unread.map((c) => (
                <li key={c.booking_id}>
                  <Link to={`/bookings/${c.booking_id}`}>
                    {t('vendor.attention.unread', {
                      count: c.unread_count,
                      name: c.customer_name,
                      ref: c.reference ?? '',
                    })}
                  </Link>
                </li>
              ))}
              {escalated.map((c) => (
                <li key={`esc-${c.booking_id}`}>
                  <Link to={`/bookings/${c.booking_id}`}>
                    {t('vendor.attention.escalated', { ref: c.reference ?? '' })}
                  </Link>
                </li>
              ))}
              {expiredDocs.map((d) => (
                <li key={`exp-${d.id}`} style={{ color: 'var(--danger)' }}>
                  <Link to="/vendor/documents" style={{ color: 'inherit' }}>
                    {t('vendor.attention.docExpired', { type: t(`vendor.docs.type.${d.type}`) })}
                  </Link>
                </li>
              ))}
              {expiringDocs.map((d) => (
                <li key={`soon-${d.id}`}>
                  <Link to="/vendor/documents">
                    {t('vendor.attention.docExpiring', {
                      type: t(`vendor.docs.type.${d.type}`),
                      date: prettyDate(d.expires_at!),
                    })}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        );
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 20 }}>
        <StatCard
          label={t('vendor.stats.earnings')}
          value={xaf(stats.earningsXaf)}
          hint={t('vendor.stats.completed', { count: stats.completedCount })}
          accent
        />
        <StatCard
          label={t('vendor.stats.awaiting')}
          value={stats.requestedCount}
          hint={stats.requestedCount > 0 ? t('vendor.stats.confirm24') : t('vendor.stats.caughtUp')}
        />
        <StatCard label={t('vendor.stats.upcoming')} value={stats.upcomingCount} />
        <StatCard
          label={t('vendor.stats.responseRate')}
          value={stats.responseRate === null ? '—' : `${stats.responseRate}%`}
          hint={
            stats.responseRate === null
              ? t('vendor.stats.noAnswered')
              : t('vendor.stats.answered', { count: stats.decidedCount })
          }
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginTop: 20 }}>
        <Card>
          <h2 style={{ margin: '0 0 6px', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 20 }}>
            {t('vendor.earningsOverview')}
          </h2>
          <EarningsChart series={stats.earningsSeries} />
        </Card>

        <Card>
          <h2 style={{ margin: '0 0 12px', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 20 }}>
            {t('vendor.vehicleStatus')}
          </h2>
          {[
            [t('vendor.fleet.total'), stats.fleet.total, 'var(--ink)'],
            [t('vendor.fleet.available'), stats.fleet.available, 'var(--success)'],
            [t('vendor.fleet.onTrip'), stats.fleet.booked, 'var(--gold-600)'],
            [t('vendor.fleet.unavailable'), stats.fleet.unavailable, 'var(--gray-500)'],
          ].map(([label, value, color]) => (
            <div
              key={label as string}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '9px 0',
                borderBottom: '1px solid var(--divider)',
                fontFamily: 'var(--font-ui)',
                fontSize: 15,
              }}
            >
              <span style={{ color: 'var(--gray-500)' }}>{label as string}</span>
              <span style={{ fontWeight: 700, color: color as string }}>{value as number}</span>
            </div>
          ))}
        </Card>
      </div>

      <h2 style={{ margin: '32px 0 14px', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 22 }}>
        {t('vendor.upcomingTrips')}
      </h2>
      {upcoming.length === 0 && (
        <EmptyState title={t('vendor.upcomingNone')} hint={t('vendor.upcomingNoneHint')} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {upcoming.map((b) => (
          <Card key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div>
              <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700 }}>
                {prettyDate(b.start_date)} → {prettyDate(b.end_date)}
              </span>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>
                {b.reference} · {xaf(b.total_xaf)}
                {b.pickup_location ? ` · ${b.pickup_location}` : ''}
              </div>
            </div>
            <StatusBadge status={b.status} />
          </Card>
        ))}
      </div>

      {!asAdmin && <DeliverySettings vendor={vendor} />}

      <h2 style={{ margin: '32px 0 14px', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 22 }}>
        {t('vendor.recentReviews')}
      </h2>
      {(!reviews || reviews.length === 0) && (
        <EmptyState title={t('vendor.noReviews')} hint={t('vendor.noReviewsHint')} />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {reviews?.slice(0, 6).map((r) => (
          <Card key={r.id}>
            <Rating value={r.rating} />
            <ReviewBody review={r} />
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gray-400)', marginTop: 8 }}>
              {prettyDate(r.created_at.slice(0, 10))}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}

// --- Booking requests ----------------------------------------------------------

/** Transitions a vendor may drive, per current status. Labels are i18n keys. */
const VENDOR_ACTIONS: Partial<
  Record<BookingStatus, Array<{ to: BookingStatus; label: string; danger?: boolean; confirm?: string }>>
> = {
  requested: [
    { to: 'confirmed', label: 'vendor.actions.confirm' },
    { to: 'rejected', label: 'vendor.actions.reject', danger: true, confirm: 'vendor.actions.rejectConfirm' },
  ],
  confirmed: [
    { to: 'in_progress', label: 'vendor.actions.startTrip' },
    { to: 'cancelled', label: 'vendor.actions.cancel', danger: true, confirm: 'vendor.actions.cancelConfirm' },
  ],
  in_progress: [{ to: 'completed', label: 'vendor.actions.complete' }],
};

function VendorBookings({ asVendorId }: { asVendorId?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-bookings', asVendorId ?? 'self'],
    queryFn: async () => {
      const all = await api<Booking[]>('/bookings/mine');
      return asVendorId ? all.filter((b) => b.vendor_id === asVendorId) : all;
    },
  });

  const transition = useMutation({
    mutationFn: ({ id, to }: { id: string; to: BookingStatus }) =>
      api<Booking>(`/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: to }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-bookings'] }),
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
    );
  }
  if (error) return <ErrorNote>{(error as Error).message}</ErrorNote>;

  return (
    <div>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 32 }}>
        {t('vendor.bookings.title')}
      </h1>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 6 }}>
        {t('vendor.bookings.sub')}
      </p>

      {data?.length === 0 && (
        <EmptyState title={t('vendor.bookings.none')} hint={t('vendor.bookings.noneHint')} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
        {data?.map((b) => (
          <Card key={b.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gray-400)' }}>
                {b.reference}
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, marginTop: 2 }}>
                {prettyDate(b.start_date)} → {prettyDate(b.end_date)}
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>
                {xaf(b.total_xaf)}
                {b.pickup_location ? ` · ${b.pickup_location}` : ''}
              </div>
              {b.customer_note && (
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>
                  &ldquo;{b.customer_note}&rdquo;
                </div>
              )}
              <Link
                to={`/bookings/${b.id}`}
                style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'var(--gold-600)', textDecoration: 'underline', display: 'inline-block', marginTop: 6 }}
              >
                {t('common.viewDetails')}
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <StatusBadge status={b.status} />
              {VENDOR_ACTIONS[b.status]?.map((a) =>
                a.confirm ? (
                  <ConfirmButton
                    key={a.to}
                    as={Button}
                    size="sm"
                    variant={a.danger ? 'danger' : 'primary'}
                    disabled={transition.isPending}
                    confirmLabel={t(a.confirm)}
                    onConfirm={() => transition.mutate({ id: b.id, to: a.to })}
                  >
                    {t(a.label)}
                  </ConfirmButton>
                ) : (
                  <Button
                    key={a.to}
                    size="sm"
                    variant={a.danger ? 'danger' : 'primary'}
                    disabled={transition.isPending}
                    onClick={() => transition.mutate({ id: b.id, to: a.to })}
                  >
                    {t(a.label)}
                  </Button>
                ),
              )}
            </div>
          </Card>
        ))}
      </div>
      {transition.isError && (
        <div style={{ marginTop: 12 }}>
          <ErrorNote>{(transition.error as Error).message}</ErrorNote>
        </div>
      )}
    </div>
  );
}

// --- My cars (list + wizard + photos + availability blocks) --------------------

function Cars({ vendorVerified, asVendorId }: { vendorVerified: boolean; asVendorId?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data: cars, isLoading } = useQuery({
    queryKey: ['my-cars', asVendorId ?? 'self'],
    queryFn: async () => {
      const all = await api<Vehicle[]>('/vehicles/mine');
      return asVendorId ? all.filter((v) => v.vendor_id === asVendorId) : all;
    },
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 32 }}>
          {asVendorId ? t('vendor.cars.titleAdmin') : t('vendor.cars.title')}
        </h1>
        {/* Adding posts to /vehicles as the caller, so it would land on the
            admin's own (non-existent) vendor record — hidden while viewing. */}
        {!asVendorId && (
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            {adding ? t('vendor.cars.close') : t('vendor.cars.add')}
          </Button>
        )}
      </div>
      {!vendorVerified && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gold-600)', marginTop: 8 }}>
          {t('vendor.cars.awaiting')}
        </p>
      )}

      {adding && <AddCarWizard onDone={() => { setAdding(false); void qc.invalidateQueries({ queryKey: ['my-cars'] }); }} />}

      {isLoading && <Spinner />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
        {cars?.map((c) => <CarRow key={c.id} car={c} />)}
        {cars?.length === 0 && !adding && (
          <EmptyState title={t('vendor.cars.none')} hint={t('vendor.cars.noneHint')} />
        )}
      </div>
    </div>
  );
}

function CarRow({ car }: { car: Vehicle }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const retire = useMutation({
    mutationFn: () =>
      api<{ removed: boolean; deactivated: boolean; bookings: number }>(`/vehicles/${car.id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-cars'] }),
  });

  const uploadPhoto = useMutation({
    mutationFn: async (file: File) => {
      const upload = await api<{ signedUrl: string; path: string }>(`/vehicles/${car.id}/photos`, {
        method: 'POST',
        body: JSON.stringify({ file_name: file.name }),
      });
      const put = await fetch(upload.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) throw new Error(`Upload failed: ${put.status}`);
      return api(`/vehicles/${car.id}/photos/attach`, { method: 'POST', body: JSON.stringify({ path: upload.path }) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-cars'] }),
  });

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {primaryPhoto(car) && <img src={primaryPhoto(car)} alt="" style={{ width: 90, height: 60, objectFit: 'contain' }} />}
          <div>
            <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 20 }}>
              {car.make} {car.model} {car.year ?? ''}
            </span>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>
              {CITY_LABEL[car.city]} · {CATEGORY_LABEL[car.category]} · {xaf(car.daily_rate_xaf)}/{t('vendor.cars.dayShort')} ·{' '}
              <Badge variant={car.status === 'active' ? 'success' : 'neutral'} style={{ fontSize: 11, padding: '3px 8px' }}>
                {t(`vendor.cars.status.${car.status}`)}
              </Badge>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <label
            style={{
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              fontSize: 14,
              padding: '9px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--ink)',
            }}
          >
            {uploadPhoto.isPending ? t('vendor.cars.uploading') : t('vendor.cars.photo')}
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadPhoto.mutate(f);
                e.target.value = '';
              }}
            />
          </label>
          <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? t('vendor.cars.close') : t('vendor.cars.edit')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? t('vendor.cars.hideAvailability') : t('vendor.cars.availability')}
          </Button>
          <ConfirmButton
            as={Button}
            variant="danger"
            size="sm"
            disabled={retire.isPending}
            confirmLabel={t('vendor.cars.retireConfirm')}
            onConfirm={() => retire.mutate()}
          >
            {retire.isPending ? t('vendor.cars.working') : t('vendor.cars.retire')}
          </ConfirmButton>
        </div>
      </div>
      {retire.isSuccess && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--success)', marginTop: 10 }}>
          {retire.data?.deactivated
            ? t('vendor.cars.retiredKept', { count: retire.data.bookings })
            : t('vendor.cars.retiredRemoved')}
        </p>
      )}
      <PhotoSlots
        vehicleId={car.id}
        angles={car.photo_angles ?? {}}
        onChanged={() => qc.invalidateQueries({ queryKey: ['my-cars'] })}
      />
      <PhotoStrip
        vehicleId={car.id}
        photos={extraPhotos(car)}
        onChanged={() => qc.invalidateQueries({ queryKey: ['my-cars'] })}
      />
      {editing && <EditCar car={car} onDone={() => setEditing(false)} />}
      {uploadPhoto.isError && <div style={{ marginTop: 10 }}><ErrorNote>{(uploadPhoto.error as Error).message}</ErrorNote></div>}
      {open && <Blocks vehicleId={car.id} />}
    </Card>
  );
}

function Blocks({ vehicleId }: { vehicleId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ['blocks', vehicleId];
  const { data: blocks } = useQuery({
    queryKey: key,
    queryFn: () => api<Array<{ id: string; start_date: string; end_date: string; reason: string | null }>>(`/vehicles/${vehicleId}/blocks`),
  });
  const [form, setForm] = useState({ start_date: '', end_date: '', reason: '' });

  const add = useMutation({
    mutationFn: () =>
      api(`/vehicles/${vehicleId}/blocks`, {
        method: 'POST',
        body: JSON.stringify({ ...form, reason: form.reason || undefined }),
      }),
    onSuccess: () => {
      setForm({ start_date: '', end_date: '', reason: '' });
      void qc.invalidateQueries({ queryKey: key });
    },
  });
  const remove = useMutation({
    mutationFn: (blockId: string) => api(`/vehicles/${vehicleId}/blocks/${blockId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--divider)', paddingTop: 16 }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
        {t('vendor.blocks.title')}
      </div>
      {blocks?.length === 0 && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-400)' }}>{t('vendor.blocks.none')}</p>
      )}
      {blocks?.map((b) => (
        <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontFamily: 'var(--font-ui)', fontSize: 14 }}>
          <span>
            {prettyDate(b.start_date)} → {prettyDate(b.end_date)}
            {b.reason ? <span style={{ color: 'var(--gray-500)' }}> · {b.reason}</span> : null}
          </span>
          <Button variant="outline" size="sm" style={{ height: 32, padding: '4px 12px', fontSize: 13 }} onClick={() => remove.mutate(b.id)}>
            {t('vendor.blocks.remove')}
          </Button>
        </div>
      ))}
      <form
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, marginTop: 10 }}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        <Input type="date" required min={form.start_date} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        <Input placeholder={t('vendor.blocks.reason')} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        <Button size="sm" type="submit" disabled={add.isPending}>{t('vendor.blocks.block')}</Button>
      </form>
      {add.isError && <div style={{ marginTop: 8 }}><ErrorNote>{(add.error as Error).message}</ErrorNote></div>}
    </div>
  );
}

/** Inline edit for the fields a vendor changes most. */
function EditCar({ car, onDone }: { car: Vehicle; onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    daily_rate_xaf: String(car.daily_rate_xaf),
    weekly_rate_xaf: car.weekly_rate_xaf ? String(car.weekly_rate_xaf) : '',
    monthly_rate_xaf: car.monthly_rate_xaf ? String(car.monthly_rate_xaf) : '',
    description: car.description ?? '',
    pickup_locations: car.pickup_locations.join(', '),
    status: car.status,
  });

  const save = useMutation({
    mutationFn: () =>
      api<Vehicle>(`/vehicles/${car.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          daily_rate_xaf: Number(form.daily_rate_xaf),
          weekly_rate_xaf: form.weekly_rate_xaf ? Number(form.weekly_rate_xaf) : null,
          monthly_rate_xaf: form.monthly_rate_xaf ? Number(form.monthly_rate_xaf) : null,
          description: form.description || undefined,
          pickup_locations: form.pickup_locations
            ? form.pickup_locations.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
          status: form.status,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-cars'] });
      onDone();
    },
  });

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--divider)', paddingTop: 16 }}>
      <form
        className="karu-form-grid"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t('vendor.form.dailyRate')}>
          <Input
            type="number"
            min={1}
            required
            value={form.daily_rate_xaf}
            onChange={(e) => setForm({ ...form, daily_rate_xaf: e.target.value })}
          />
        </Field>
        <Field label={t('vendor.form.weeklyRate')}>
          <Input
            type="number"
            min={1}
            value={form.weekly_rate_xaf}
            onChange={(e) => setForm({ ...form, weekly_rate_xaf: e.target.value })}
          />
        </Field>
        <Field label={t('vendor.form.monthlyRate')}>
          <Input
            type="number"
            min={1}
            value={form.monthly_rate_xaf}
            onChange={(e) => setForm({ ...form, monthly_rate_xaf: e.target.value })}
          />
        </Field>
        <Field label={t('vendor.form.status')}>
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Vehicle['status'] })}>
            <option value="active">{t('vendor.form.statusActive')}</option>
            <option value="draft">{t('vendor.form.statusDraft')}</option>
            <option value="inactive">{t('vendor.form.statusInactive')}</option>
          </Select>
        </Field>
        <Field label={t('vendor.form.pickups')} style={{ gridColumn: '1 / -1' }}>
          <Input
            value={form.pickup_locations}
            onChange={(e) => setForm({ ...form, pickup_locations: e.target.value })}
          />
        </Field>
        <Field label={t('vendor.form.description')} style={{ gridColumn: '1 / -1' }}>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
          <Button size="sm" type="submit" disabled={save.isPending}>
            {save.isPending ? t('vendor.saving') : t('vendor.form.save')}
          </Button>
          <Button size="sm" variant="outline" type="button" onClick={onDone}>
            {t('vendor.form.cancel')}
          </Button>
        </div>
      </form>
      {save.isError && <div style={{ marginTop: 10 }}><ErrorNote>{(save.error as Error).message}</ErrorNote></div>}
    </div>
  );
}

// --- Add-car wizard (mockup StepNav flow) ---------------------------------------

function AddCarWizard({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const steps = [t('vendor.wizard.stepDetails'), t('vendor.wizard.stepPricing'), t('vendor.wizard.stepReview')];
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    make: '',
    model: '',
    year: '',
    category: 'sedan',
    seats: '',
    transmission: 'manual',
    registration_number: '',
    fuel_type: 'petrol',
    daily_rate_xaf: '',
    weekly_rate_xaf: '',
    monthly_rate_xaf: '',
    driver_option: 'none',
    driver_daily_rate_xaf: '',
    city: 'douala',
    pickup_locations: '',
    description: '',
  });

  const create = useMutation({
    mutationFn: () =>
      api<Vehicle>('/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          make: form.make,
          model: form.model,
          year: Number(form.year),
          category: form.category,
          seats: Number(form.seats),
          transmission: form.transmission,
          registration_number: form.registration_number,
          fuel_type: form.fuel_type,
          daily_rate_xaf: Number(form.daily_rate_xaf),
          weekly_rate_xaf: form.weekly_rate_xaf ? Number(form.weekly_rate_xaf) : undefined,
          monthly_rate_xaf: form.monthly_rate_xaf ? Number(form.monthly_rate_xaf) : undefined,
          driver_option: form.driver_option,
          driver_daily_rate_xaf:
            form.driver_option === 'none' ? undefined : Number(form.driver_daily_rate_xaf),
          city: form.city,
          pickup_locations: form.pickup_locations ? form.pickup_locations.split(',').map((s) => s.trim()) : [],
          description: form.description || undefined,
        }),
      }),
    onSuccess: onDone,
  });

  const detailsOk =
    form.make &&
    form.model &&
    form.registration_number &&
    Number(form.year) >= 1980 &&
    Number(form.seats) >= 1;
  const pricingOk =
    Number(form.daily_rate_xaf) > 0 &&
    // A car offered with a driver but no driver rate can't be quoted, and the
    // DB constraint would reject it anyway.
    (form.driver_option === 'none' || Number(form.driver_daily_rate_xaf) > 0);

  return (
    <Card style={{ marginTop: 20 }}>
      <StepNav steps={steps} current={step} style={{ marginBottom: 22 }} />

      {step === 0 && (
        <div className="karu-form-grid">
          <Field label={t('vendor.form.make')}><Input required value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} /></Field>
          <Field label={t('vendor.form.model')}><Input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
          <Field label={t('vendor.form.year')}><Input type="number" min={1980} required value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></Field>
          <Field label={t('vendor.form.seats')}><Input type="number" min={1} required value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} /></Field>
          <Field label={t('vendor.form.plate')}>
            <Input
              required
              value={form.registration_number}
              onChange={(e) => setForm({ ...form, registration_number: e.target.value })}
              placeholder="LT 1234 AB"
            />
          </Field>
          <Field label={t('vendor.form.fuel')}>
            <Select value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}>
              <option value="petrol">{t('common.fuel.petrol')}</option>
              <option value="diesel">{t('common.fuel.diesel')}</option>
              <option value="hybrid">{t('common.fuel.hybrid')}</option>
              <option value="electric">{t('common.fuel.electric')}</option>
            </Select>
          </Field>
          <Field label={t('vendor.form.type')}>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label={t('vendor.form.gearbox')}>
            <Select value={form.transmission} onChange={(e) => setForm({ ...form, transmission: e.target.value })}>
              <option value="manual">{t('common.manual')}</option>
              <option value="automatic">{t('common.automatic')}</option>
            </Select>
          </Field>
          <Field label={t('vendor.form.description')} style={{ gridColumn: '1 / -1' }}>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="karu-form-grid">
          <Field label={t('vendor.form.dailyRate')}>
            <Input type="number" min={1} required value={form.daily_rate_xaf} onChange={(e) => setForm({ ...form, daily_rate_xaf: e.target.value })} />
          </Field>
          <Field label={t('vendor.form.city')}>
            <Select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
              <option value="douala">{t('city.douala')}</option>
              <option value="yaounde">{t('city.yaounde')}</option>
              <option value="other">{t('city.other')}</option>
            </Select>
          </Field>
          <Field label={t('vendor.form.weeklyRate')}>
            <Input type="number" min={1} value={form.weekly_rate_xaf} onChange={(e) => setForm({ ...form, weekly_rate_xaf: e.target.value })} placeholder={t('vendor.form.weeklyPlaceholder')} />
          </Field>
          <Field label={t('vendor.form.monthlyRate')}>
            <Input type="number" min={1} value={form.monthly_rate_xaf} onChange={(e) => setForm({ ...form, monthly_rate_xaf: e.target.value })} placeholder={t('vendor.form.monthlyPlaceholder')} />
          </Field>
          <Field label={t('vendor.form.driver')}>
            <Select
              value={form.driver_option}
              onChange={(e) => setForm({ ...form, driver_option: e.target.value })}
            >
              <option value="none">{t('vendor.form.driverNone')}</option>
              <option value="optional">{t('vendor.form.driverOptional')}</option>
              <option value="required">{t('vendor.form.driverRequired')}</option>
            </Select>
          </Field>
          {form.driver_option !== 'none' && (
            <Field label={t('vendor.form.driverRate')}>
              <Input
                type="number"
                min={1}
                required
                value={form.driver_daily_rate_xaf}
                onChange={(e) => setForm({ ...form, driver_daily_rate_xaf: e.target.value })}
                placeholder="20000"
              />
            </Field>
          )}
          <Field label={t('vendor.form.pickups')} style={{ gridColumn: '1 / -1' }}>
            <Input value={form.pickup_locations} onChange={(e) => setForm({ ...form, pickup_locations: e.target.value })} placeholder="Douala International Airport, Akwa" />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, lineHeight: 1.8 }}>
          <strong style={{ fontFamily: 'var(--font-sans)', fontSize: 20 }}>
            {form.make} {form.model} {form.year}
          </strong>
          <br />
          {CATEGORY_LABEL[form.category]}
          {form.seats ? <> · {t('common.seats', { count: Number(form.seats) })}</> : null} ·{' '}
          {form.transmission === 'automatic' ? t('common.automatic') : t('common.manual')} ·{' '}
          {t(`common.fuel.${form.fuel_type}`)} · {CITY_LABEL[form.city]}
          <br />
          {t('vendor.wizard.plate')} {form.registration_number || '—'}
          <br />
          {form.daily_rate_xaf ? xaf(Number(form.daily_rate_xaf)) : '—'} {t('common.perDay')}
          {form.weekly_rate_xaf && <> · {xaf(Number(form.weekly_rate_xaf))} {t('vendor.wizard.perWeek')}</>}
          {form.monthly_rate_xaf && <> · {xaf(Number(form.monthly_rate_xaf))} {t('vendor.wizard.perMonth')}</>}
          {form.pickup_locations && <><br />{t('vendor.wizard.pickup')} {form.pickup_locations}</>}
          <p style={{ color: 'var(--gray-500)', fontSize: 13 }}>
            {t('vendor.wizard.draftNote')}
          </p>
        </div>
      )}

      {create.isError && <div style={{ marginTop: 12 }}><ErrorNote>{(create.error as Error).message}</ErrorNote></div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
        <Button variant="outline" size="sm" onClick={() => (step === 0 ? onDone() : setStep(step - 1))}>
          {step === 0 ? t('vendor.wizard.cancel') : t('vendor.wizard.back')}
        </Button>
        {step < 2 ? (
          <Button size="sm" disabled={step === 0 ? !detailsOk : !pricingOk} onClick={() => setStep(step + 1)}>
            {t('vendor.wizard.continue')}
          </Button>
        ) : (
          <Button size="sm" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? t('vendor.wizard.creating') : t('vendor.wizard.create')}
          </Button>
        )}
      </div>
    </Card>
  );
}

// --- Documents -------------------------------------------------------------------

/** Business/identity paperwork — scoped to the vendor. One of these unblocks review. */
const BUSINESS_DOCS = ['rccm', 'national_id', 'passport'] as const;

/** Car paperwork — each certificate legally covers one car. */
const VEHICLE_DOCS = [
  { type: 'carte_grise', expires: false },
  { type: 'insurance', expires: true },
  { type: 'roadworthiness', expires: true },
] as const;

const sectionTitle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontWeight: 700,
  fontSize: 20,
  margin: '28px 0 4px',
};

function Documents({ asVendor }: { asVendor?: Vendor }) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  // Both sides of the desk see the same paperwork: an admin reads it via the
  // review queue's endpoint, the vendor via their own — either way each
  // document arrives with its status and any reviewer note.
  const { data: docs, isLoading } = useQuery({
    queryKey: ['vendor-docs', asVendor?.id ?? 'me'],
    queryFn: () =>
      asVendor
        ? api<(VendorDocument & { vendors?: { business_name: string } })[]>(
            `/admin/documents?vendor_id=${asVendor.id}`,
          )
        : api<VendorDocument[]>('/vendors/me/documents'),
  });

  // Car paperwork hangs off the car it covers, so the cars come too. An admin
  // gets the whole fleet from /vehicles/mine — scope it to this provider.
  const { data: cars } = useQuery({
    queryKey: ['my-cars', asVendor?.id ?? 'self'],
    queryFn: async () => {
      const all = await api<Vehicle[]>('/vehicles/mine');
      return asVendor ? all.filter((v) => v.vendor_id === asVendor.id) : all;
    },
  });

  // The vendor uploads their own paperwork; an admin files it on the
  // vendor's behalf — same signed-URL flow, different endpoint.
  const upload = useMutation({
    mutationFn: async ({
      type,
      file,
      vehicleId,
      expiresAt,
    }: {
      type: string;
      file: File;
      vehicleId?: string;
      expiresAt?: string;
    }) => {
      const res = await api<{ document: VendorDocument; upload: { signedUrl: string; path: string } }>(
        asVendor ? `/admin/vendors/${asVendor.id}/documents` : '/vendors/me/documents',
        {
          method: 'POST',
          body: JSON.stringify({
            type,
            vehicle_id: vehicleId,
            expires_at: expiresAt || undefined,
          }),
        },
      );
      const put = await fetch(res.upload.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) throw new Error(`Upload failed: ${put.status}`);
      return res.document;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendor-me'] });
      void qc.invalidateQueries({ queryKey: ['vendor-docs'] });
    },
  });

  const findDoc = (type: string, vehicleId?: string) =>
    docs?.find((d) => d.type === type && (vehicleId ? d.vehicle_id === vehicleId : !d.vehicle_id));

  // Fleet-wide car paperwork from before documents were scoped per vehicle.
  // Shown read-only so an already-verified vendor doesn't look undocumented.
  const vehicleTypes = new Set<string>(VEHICLE_DOCS.map((d) => d.type));
  const legacyDocs = docs?.filter((d) => !d.vehicle_id && vehicleTypes.has(d.type)) ?? [];

  return (
    <div>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 32 }}>{t('vendor.docs.title')}</h1>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 6 }}>
        {asVendor ? (
          <>
            {t('vendor.docs.subAdmin', { name: asVendor.business_name })}
            <Link to="/admin/documents" style={{ color: 'var(--gold-600)', fontWeight: 600 }}>{t('vendor.docs.reviewQueue')}</Link>.
          </>
        ) : (
          t('vendor.docs.subVendor')
        )}
      </p>
      {isLoading && <Spinner />}

      {asVendor && docs && cars && (
        <VerificationChecklist vendor={asVendor} docs={docs} cars={cars} />
      )}

      <h2 style={sectionTitle}>{t('vendor.docs.businessTitle')}</h2>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)', margin: '0 0 12px' }}>
        {t('vendor.docs.businessHint')}
      </p>
      <Card style={{ maxWidth: 640 }}>
        {BUSINESS_DOCS.map((type, i) => (
          <DocRow
            key={type}
            first={i === 0}
            label={t(`vendor.docs.type.${type}`)}
            doc={findDoc(type)}
            pending={upload.isPending}
            onUpload={(file) => upload.mutate({ type, file })}
          />
        ))}
      </Card>

      <h2 style={sectionTitle}>{t('vendor.docs.perVehicleTitle')}</h2>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)', margin: '0 0 12px' }}>
        {t('vendor.docs.perVehicleHint')}
      </p>
      {cars?.length === 0 && (
        <EmptyState title={t('vendor.cars.none')} hint={t('vendor.docs.noCarsHint')} />
      )}
      <div style={{ display: 'grid', gap: 14, maxWidth: 640 }}>
        {cars?.map((car) => (
          <Card key={car.id}>
            <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 17 }}>
              {car.make} {car.model} {car.year ?? ''}
              {car.registration_number && (
                <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'var(--gray-500)', marginLeft: 10 }}>
                  {car.registration_number}
                </span>
              )}
            </div>
            {VEHICLE_DOCS.map((d) => (
              <DocRow
                key={d.type}
                label={t(`vendor.docs.type.${d.type}`)}
                doc={findDoc(d.type, car.id)}
                withExpiry={d.expires}
                pending={upload.isPending}
                onUpload={(file, expiresAt) =>
                  upload.mutate({ type: d.type, file, vehicleId: car.id, expiresAt })
                }
              />
            ))}
          </Card>
        ))}
      </div>

      {legacyDocs.length > 0 && (
        <>
          <h2 style={sectionTitle}>{t('vendor.docs.legacyTitle')}</h2>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)', margin: '0 0 12px' }}>
            {t('vendor.docs.legacyHint')}
          </p>
          <Card style={{ maxWidth: 640 }}>
            {legacyDocs.map((d, i) => (
              <DocRow
                key={d.id}
                first={i === 0}
                label={t(`vendor.docs.type.${d.type}`)}
                doc={d}
                pending={false}
              />
            ))}
          </Card>
        </>
      )}

      {upload.isError && <div style={{ marginTop: 12 }}><ErrorNote>{(upload.error as Error).message}</ErrorNote></div>}
      {upload.isSuccess && (
        <p style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--success)', marginTop: 12 }}>
          {t('vendor.docs.received')}
        </p>
      )}
    </div>
  );
}

/**
 * The onboarding doc's §12 "Karu Verification Status" box, derived live from
 * document approvals, photo slots and the vendor's status — no separate
 * booleans to keep in sync. Internal use: rendered only for admins.
 */
function VerificationChecklist({
  vendor,
  docs,
  cars,
}: {
  vendor: Vendor;
  docs: VendorDocument[];
  cars: Vehicle[];
}) {
  const { t } = useTranslation();
  // A fleet-wide (legacy, pre-per-vehicle) approval counts for every car.
  const approved = (type: VendorDocument['type'], vehicleId?: string) =>
    docs.some(
      (d) =>
        d.type === type &&
        d.status === 'approved' &&
        (vehicleId ? d.vehicle_id === vehicleId || !d.vehicle_id : !d.vehicle_id),
    );

  const identityVerified = approved('national_id') || approved('passport') || approved('rccm');
  const businessVerified = approved('rccm');

  const tick = (done: boolean) => (
    <span aria-hidden="true" style={{ fontWeight: 700, color: done ? 'var(--success)' : 'var(--gray-400)' }}>
      {done ? '✓' : '☐'}
    </span>
  );
  const row: CSSProperties = {
    display: 'flex',
    gap: 8,
    alignItems: 'baseline',
    fontFamily: 'var(--font-ui)',
    fontSize: 14,
    padding: '3px 0',
  };

  return (
    <Card style={{ maxWidth: 640, marginTop: 16, borderLeft: '4px solid var(--yellow)' }}>
      <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 17 }}>
        {t('vendor.checklist.title')}{' '}
        <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--gray-500)' }}>{t('vendor.checklist.internal')}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={row}>{tick(identityVerified)} {t('vendor.checklist.identity')}</div>
        <div style={row}>
          {tick(businessVerified)} {t('vendor.checklist.business')}
          {!businessVerified && identityVerified && (
            <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{t('vendor.checklist.identityOnly')}</span>
          )}
        </div>
        {cars.map((car) => {
          const photosMissing = missingPhotoAngles(car.photo_angles ?? {}).length;
          return (
            <div key={car.id} style={{ ...row, flexWrap: 'wrap' }}>
              {tick(
                approved('carte_grise', car.id) &&
                  approved('insurance', car.id) &&
                  approved('roadworthiness', car.id) &&
                  photosMissing === 0,
              )}
              <span>
                {car.make} {car.model}
                {car.registration_number ? ` (${car.registration_number})` : ''}:{' '}
                <span style={{ color: 'var(--gray-500)' }}>
                  {t('vendor.checklist.registration')} {approved('carte_grise', car.id) ? '✓' : '☐'} ·{' '}
                  {t('vendor.checklist.insurance')} {approved('insurance', car.id) ? '✓' : '☐'} ·{' '}
                  {t('vendor.checklist.roadworthiness')} {approved('roadworthiness', car.id) ? '✓' : '☐'} ·{' '}
                  {t('vendor.checklist.photos')} {6 - photosMissing}/6
                </span>
              </span>
            </div>
          );
        })}
        {cars.length === 0 && (
          <div style={{ ...row, color: 'var(--gray-500)' }}>{t('vendor.checklist.noCars')}</div>
        )}
        <div style={row}>{tick(vendor.status === 'verified')} {t('vendor.checklist.approved')}</div>
      </div>
    </Card>
  );
}

/**
 * One document line: label, review status (with reviewer note on rejection),
 * an expiry date for certificates that have one, and the upload control.
 * Without onUpload the row is read-only (legacy fleet-wide paperwork).
 */
function DocRow({
  label,
  doc,
  onUpload,
  withExpiry = false,
  pending,
  first = false,
}: {
  label: string;
  doc?: VendorDocument;
  onUpload?: (file: File, expiresAt?: string) => void;
  withExpiry?: boolean;
  pending: boolean;
  first?: boolean;
}) {
  const { t } = useTranslation();
  const [expiresAt, setExpiresAt] = useState('');

  const statusColor =
    doc?.status === 'approved' ? 'var(--success)'
    : doc?.status === 'rejected' ? 'var(--danger, #c0392b)'
    : doc ? 'var(--gold-600)'
    : 'var(--gray-400)';

  return (
    <div style={{ padding: '10px 0', borderTop: first ? 'none' : '1px solid var(--divider)', marginTop: first ? 0 : 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14 }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700, color: statusColor }}>
            {doc ? t(`vendor.docs.status.${doc.status}`) : t('vendor.docs.status.notUploaded')}
            {doc?.expires_at && (
              <span style={{ fontWeight: 500, color: 'var(--gray-500)' }}>
                {' '}· {t('vendor.docs.until', { date: prettyDate(doc.expires_at) })}
              </span>
            )}
          </span>
          {onUpload && withExpiry && (
            <input
              type="date"
              aria-label={t('vendor.docs.expiryAria', { label })}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                padding: '6px 8px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--divider)',
              }}
            />
          )}
          {onUpload && (
            <label
              style={{
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                fontWeight: 600,
                fontSize: 13,
                padding: '8px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--yellow)',
                color: 'var(--ink)',
              }}
            >
              {pending
                ? t('vendor.docs.uploading')
                : doc?.status === 'rejected'
                  ? t('vendor.docs.reupload')
                  : doc
                    ? t('vendor.docs.replace')
                    : t('vendor.docs.upload')}
              <input
                type="file"
                accept="image/*,.pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f, expiresAt || undefined);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
      </div>
      {doc?.status === 'rejected' && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--danger, #c0392b)', marginTop: 6, marginBottom: 0 }}>
          {doc.notes ? t('vendor.docs.reviewerNote', { note: doc.notes }) : t('vendor.docs.rejectedFallback')}
        </p>
      )}
    </div>
  );
}
