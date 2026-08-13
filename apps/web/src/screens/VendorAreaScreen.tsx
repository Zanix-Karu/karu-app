import { useState, type CSSProperties, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  missingPhotoAngles,
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
  { key: 'dashboard', label: 'Dashboard', path: '/vendor' },
  { key: 'bookings', label: 'Booking requests', path: '/vendor/bookings' },
  { key: 'cars', label: 'My cars', path: '/vendor/cars' },
  { key: 'documents', label: 'Documents', path: '/vendor/documents' },
];

/** Section is derived from the URL so the rail, header nav and page agree. */
function sectionFromPath(pathname: string): Section {
  if (pathname.startsWith('/vendor/bookings')) return 'bookings';
  if (pathname.startsWith('/vendor/cars')) return 'cars';
  if (pathname.startsWith('/vendor/documents')) return 'documents';
  return 'dashboard';
}

export function VendorAreaScreen() {
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

  if (!isAdmin && isLoading) return <Spinner label="Loading your vendor account…" />;
  if (!isAdmin && error) return <ErrorNote>{(error as Error).message}</ErrorNote>;

  if (isAdmin && !active) {
    return (
      <div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 32 }}>
          Provider area
        </h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 6 }}>
          You&rsquo;re an admin, so you have no provider account of your own. Choose a provider to
          view their dashboard as they see it.
        </p>
        <Card style={{ marginTop: 18, maxWidth: 420 }}>
          <Field label="Provider">
            <Select value={asVendorId} onChange={(e) => setAsVendorId(e.target.value)}>
              <option value="">Choose a provider…</option>
              {allVendors?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.business_name} ({v.status})
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
            {active.status === 'verified' ? '✓ Verified' : `Verification ${active.status}`}
          </Badge>
          {isAdmin && (
            <button
              onClick={() => setAsVendorId('')}
              style={{ display: 'block', marginTop: 10, background: 'none', border: 'none', padding: 0,
                cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--yellow)', textDecoration: 'underline' }}
            >
              Switch provider
            </button>
          )}
        </div>
        <SidebarNav
          items={NAV}
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
      title: 'Business details',
      body: `${vendor.business_name} · ${CITY_LABEL[vendor.city]}`,
      action: null as null | { label: string; to: string },
    },
    {
      done: docsUploaded && rejectedDocs.length === 0,
      title: 'Upload your documents',
      body: rejectedDocs.length
        ? `${rejectedDocs.length} document${rejectedDocs.length === 1 ? ' was' : 's were'} rejected — see the reviewer's note and re-upload.`
        : "RCCM — or a national ID / passport if the business isn't registered. We review within one business day.",
      action: { label: rejectedDocs.length ? 'Fix documents' : 'Upload documents', to: '/vendor/documents' },
    },
    {
      done: (cars?.length ?? 0) > 0,
      title: 'Add your first car',
      body:
        (cars?.length ?? 0) > 0
          ? `${cars!.length} car${cars!.length === 1 ? '' : 's'} added — set a listing to Active and it goes live.`
          : 'Add a car now — it starts as a draft, and goes live once your account is verified and the listing is set to Active.',
      action: { label: 'Add a car', to: '/vendor/cars' },
    },
  ];

  return (
    <Card style={{ marginBottom: 24, borderLeft: '4px solid var(--yellow)' }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 22 }}>
        {rejected ? 'Your account needs attention' : 'Welcome to Karu — two steps to go live'}
      </h2>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 6 }}>
        {rejected
          ? `Verification is currently ${vendor.status}. Send us a message and we will help sort it out.`
          : 'Add your cars and paperwork now — your listings go live to customers as soon as your account is verified.'}
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
        Delivery
      </h2>
      <Card>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', margin: '0 0 14px' }}>
          Most customers booking from abroad want the car brought to the airport.
          Leave a field blank if you don&rsquo;t offer it.
        </p>
        <div className="karu-form-grid">
          <Field label="Airport meet-and-greet (XAF)">
            <Input
              type="number"
              min={0}
              value={airport}
              onChange={(e) => setAirport(e.target.value)}
              placeholder="Not offered"
            />
          </Field>
          <Field label="Delivery to an address (XAF)">
            <Input
              type="number"
              min={0}
              value={delivery}
              onChange={(e) => setDelivery(e.target.value)}
              placeholder="Not offered"
            />
          </Field>
        </div>
        <Button size="sm" style={{ marginTop: 14 }} disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save delivery pricing'}
        </Button>
        {save.isError && <div style={{ marginTop: 10 }}><ErrorNote>{(save.error as Error).message}</ErrorNote></div>}
        {save.isSuccess && (
          <span style={{ marginLeft: 12, fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--success)' }}>
            Saved ✓
          </span>
        )}
      </Card>
    </>
  );
}

function Dashboard({ vendor, asAdmin = false }: { vendor: Vendor; asAdmin?: boolean }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['vendor-stats', vendor.id, asAdmin],
    queryFn: () =>
      api<VendorStats>(asAdmin ? `/admin/vendors/${vendor.id}/stats` : '/vendors/me/stats'),
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
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 32 }}>
          {greeting}, {vendor.business_name}
        </h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to={`/vendors/${vendor.id}`}>
            <Button size="sm" variant="outline">View public profile</Button>
          </Link>
          <Link to="/vendor/cars">
            <Button size="sm">Add a car</Button>
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 20 }}>
        <StatCard
          label="Total earnings"
          value={xaf(stats.earningsXaf)}
          hint={`${stats.completedCount} completed rental${stats.completedCount === 1 ? '' : 's'}`}
          accent
        />
        <StatCard
          label="Requests awaiting reply"
          value={stats.requestedCount}
          hint={stats.requestedCount > 0 ? 'Confirm within 24h' : 'All caught up'}
        />
        <StatCard label="Upcoming bookings" value={stats.upcomingCount} />
        <StatCard
          label="Response rate"
          value={stats.responseRate === null ? '—' : `${stats.responseRate}%`}
          hint={
            stats.responseRate === null
              ? 'No answered requests yet'
              : `${stats.decidedCount} request${stats.decidedCount === 1 ? '' : 's'} answered within 24h`
          }
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginTop: 20 }}>
        <Card>
          <h2 style={{ margin: '0 0 6px', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 20 }}>
            Earnings overview
          </h2>
          <EarningsChart series={stats.earningsSeries} />
        </Card>

        <Card>
          <h2 style={{ margin: '0 0 12px', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 20 }}>
            Vehicle status
          </h2>
          {[
            ['Total vehicles', stats.fleet.total, 'var(--ink)'],
            ['Available today', stats.fleet.available, 'var(--success)'],
            ['On a trip today', stats.fleet.booked, 'var(--gold-600)'],
            ['Unavailable', stats.fleet.unavailable, 'var(--gray-500)'],
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
        Upcoming trips
      </h2>
      {upcoming.length === 0 && <EmptyState title="Nothing upcoming" hint="Confirmed trips appear here." />}
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
        Recent reviews
      </h2>
      {(!reviews || reviews.length === 0) && (
        <EmptyState title="No reviews yet" hint="Customers can review you once a trip is completed." />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {reviews?.slice(0, 6).map((r) => (
          <Card key={r.id}>
            <Rating value={r.rating} />
            {r.comment && (
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
                &ldquo;{r.comment}&rdquo;
              </p>
            )}
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

/** Transitions a vendor may drive, per current status. */
const VENDOR_ACTIONS: Partial<
  Record<BookingStatus, Array<{ to: BookingStatus; label: string; danger?: boolean; confirm?: string }>>
> = {
  requested: [
    { to: 'confirmed', label: 'Confirm' },
    { to: 'rejected', label: 'Reject', danger: true, confirm: 'Reject this request?' },
  ],
  confirmed: [
    { to: 'in_progress', label: 'Start trip' },
    { to: 'cancelled', label: 'Cancel', danger: true, confirm: 'Cancel this booking?' },
  ],
  in_progress: [{ to: 'completed', label: 'Complete' }],
};

function VendorBookings({ asVendorId }: { asVendorId?: string }) {
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
        Booking requests
      </h1>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 6 }}>
        Confirm or decline within 24 hours. Customers see the change straight away, and we email them too.
      </p>

      {data?.length === 0 && (
        <EmptyState title="No requests yet" hint="Requests for your cars will appear here." />
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
                View details
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
                    confirmLabel={a.confirm}
                    onConfirm={() => transition.mutate({ id: b.id, to: a.to })}
                  >
                    {a.label}
                  </ConfirmButton>
                ) : (
                  <Button
                    key={a.to}
                    size="sm"
                    variant={a.danger ? 'danger' : 'primary'}
                    disabled={transition.isPending}
                    onClick={() => transition.mutate({ id: b.id, to: a.to })}
                  >
                    {a.label}
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
          {asVendorId ? 'Cars' : 'My cars'}
        </h1>
        {/* Adding posts to /vehicles as the caller, so it would land on the
            admin's own (non-existent) vendor record — hidden while viewing. */}
        {!asVendorId && (
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : '+ Add a car'}
          </Button>
        )}
      </div>
      {!vendorVerified && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gold-600)', marginTop: 8 }}>
          Your account is awaiting verification — add your cars and paperwork now, but listings
          stay hidden from customers until the Karu team approves your documents.
        </p>
      )}

      {adding && <AddCarWizard onDone={() => { setAdding(false); void qc.invalidateQueries({ queryKey: ['my-cars'] }); }} />}

      {isLoading && <Spinner />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
        {cars?.map((c) => <CarRow key={c.id} car={c} />)}
        {cars?.length === 0 && !adding && <EmptyState title="No cars yet" hint="Add your first car to start earning." />}
      </div>
    </div>
  );
}

function CarRow({ car }: { car: Vehicle }) {
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
          {car.photos[0] && <img src={car.photos[0]} alt="" style={{ width: 90, height: 60, objectFit: 'contain' }} />}
          <div>
            <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 20 }}>
              {car.make} {car.model} {car.year ?? ''}
            </span>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>
              {CITY_LABEL[car.city]} · {CATEGORY_LABEL[car.category]} · {xaf(car.daily_rate_xaf)}/day ·{' '}
              <Badge variant={car.status === 'active' ? 'success' : 'neutral'} style={{ fontSize: 11, padding: '3px 8px' }}>
                {car.status}
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
            {uploadPhoto.isPending ? 'Uploading…' : '+ Photo'}
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
            {editing ? 'Close' : 'Edit'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide availability' : 'Availability'}
          </Button>
          <ConfirmButton
            as={Button}
            variant="danger"
            size="sm"
            disabled={retire.isPending}
            confirmLabel="Retire this car?"
            onConfirm={() => retire.mutate()}
          >
            {retire.isPending ? 'Working…' : 'Retire'}
          </ConfirmButton>
        </div>
      </div>
      {retire.isSuccess && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--success)', marginTop: 10 }}>
          {retire.data?.deactivated
            ? `Taken off the marketplace — ${retire.data.bookings} booking(s) kept for your records.`
            : 'Listing removed.'}
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
        Blocked dates (maintenance, private use)
      </div>
      {blocks?.length === 0 && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-400)' }}>No blocks — fully bookable.</p>
      )}
      {blocks?.map((b) => (
        <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontFamily: 'var(--font-ui)', fontSize: 14 }}>
          <span>
            {prettyDate(b.start_date)} → {prettyDate(b.end_date)}
            {b.reason ? <span style={{ color: 'var(--gray-500)' }}> · {b.reason}</span> : null}
          </span>
          <Button variant="outline" size="sm" style={{ height: 32, padding: '4px 12px', fontSize: 13 }} onClick={() => remove.mutate(b.id)}>
            Remove
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
        <Input placeholder="Reason (optional)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        <Button size="sm" type="submit" disabled={add.isPending}>Block</Button>
      </form>
      {add.isError && <div style={{ marginTop: 8 }}><ErrorNote>{(add.error as Error).message}</ErrorNote></div>}
    </div>
  );
}

/** Inline edit for the fields a vendor changes most. */
function EditCar({ car, onDone }: { car: Vehicle; onDone: () => void }) {
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
        <Field label="Daily rate (XAF)">
          <Input
            type="number"
            min={1}
            required
            value={form.daily_rate_xaf}
            onChange={(e) => setForm({ ...form, daily_rate_xaf: e.target.value })}
          />
        </Field>
        <Field label="Weekly rate (XAF, optional)">
          <Input
            type="number"
            min={1}
            value={form.weekly_rate_xaf}
            onChange={(e) => setForm({ ...form, weekly_rate_xaf: e.target.value })}
          />
        </Field>
        <Field label="Monthly rate (XAF, optional)">
          <Input
            type="number"
            min={1}
            value={form.monthly_rate_xaf}
            onChange={(e) => setForm({ ...form, monthly_rate_xaf: e.target.value })}
          />
        </Field>
        <Field label="Listing status">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Vehicle['status'] })}>
            <option value="active">Active — bookable</option>
            <option value="draft">Draft — hidden</option>
            <option value="inactive">Inactive — hidden</option>
          </Select>
        </Field>
        <Field label="Pick-up points (comma-separated)" style={{ gridColumn: '1 / -1' }}>
          <Input
            value={form.pickup_locations}
            onChange={(e) => setForm({ ...form, pickup_locations: e.target.value })}
          />
        </Field>
        <Field label="Description" style={{ gridColumn: '1 / -1' }}>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
          <Button size="sm" type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          <Button size="sm" variant="outline" type="button" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
      {save.isError && <div style={{ marginTop: 10 }}><ErrorNote>{(save.error as Error).message}</ErrorNote></div>}
    </div>
  );
}

// --- Add-car wizard (mockup StepNav flow) ---------------------------------------

const STEPS = ['Car details', 'Pricing', 'Review'];

function AddCarWizard({ onDone }: { onDone: () => void }) {
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
      <StepNav steps={STEPS} current={step} style={{ marginBottom: 22 }} />

      {step === 0 && (
        <div className="karu-form-grid">
          <Field label="Make"><Input required value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} /></Field>
          <Field label="Model"><Input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
          <Field label="Year"><Input type="number" min={1980} required value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></Field>
          <Field label="Seats"><Input type="number" min={1} required value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} /></Field>
          <Field label="Number plate">
            <Input
              required
              value={form.registration_number}
              onChange={(e) => setForm({ ...form, registration_number: e.target.value })}
              placeholder="LT 1234 AB"
            />
          </Field>
          <Field label="Fuel">
            <Select value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}>
              <option value="petrol">Petrol</option>
              <option value="diesel">Diesel</option>
              <option value="hybrid">Hybrid</option>
              <option value="electric">Electric</option>
            </Select>
          </Field>
          <Field label="Type">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Gearbox">
            <Select value={form.transmission} onChange={(e) => setForm({ ...form, transmission: e.target.value })}>
              <option value="manual">Manual</option>
              <option value="automatic">Automatic</option>
            </Select>
          </Field>
          <Field label="Description" style={{ gridColumn: '1 / -1' }}>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="karu-form-grid">
          <Field label="Daily rate (XAF)">
            <Input type="number" min={1} required value={form.daily_rate_xaf} onChange={(e) => setForm({ ...form, daily_rate_xaf: e.target.value })} />
          </Field>
          <Field label="City">
            <Select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
              <option value="douala">Douala</option>
              <option value="yaounde">Yaoundé</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Weekly rate (XAF, optional)">
            <Input type="number" min={1} value={form.weekly_rate_xaf} onChange={(e) => setForm({ ...form, weekly_rate_xaf: e.target.value })} placeholder="Leave blank for daily x 7" />
          </Field>
          <Field label="Monthly rate (XAF, optional)">
            <Input type="number" min={1} value={form.monthly_rate_xaf} onChange={(e) => setForm({ ...form, monthly_rate_xaf: e.target.value })} placeholder="Leave blank for daily x 30" />
          </Field>
          <Field label="Driver">
            <Select
              value={form.driver_option}
              onChange={(e) => setForm({ ...form, driver_option: e.target.value })}
            >
              <option value="none">Self-drive only</option>
              <option value="optional">Driver available (customer chooses)</option>
              <option value="required">Always with a driver</option>
            </Select>
          </Field>
          {form.driver_option !== 'none' && (
            <Field label="Driver rate per day (XAF)">
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
          <Field label="Pick-up points (comma-separated)" style={{ gridColumn: '1 / -1' }}>
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
          {CATEGORY_LABEL[form.category]} · {form.seats || '—'} seats · {form.transmission} · {form.fuel_type} · {CITY_LABEL[form.city]}
          <br />
          Plate: {form.registration_number || '—'}
          <br />
          {form.daily_rate_xaf ? xaf(Number(form.daily_rate_xaf)) : '—'} per day
          {form.weekly_rate_xaf && <> · {xaf(Number(form.weekly_rate_xaf))} per week</>}
          {form.monthly_rate_xaf && <> · {xaf(Number(form.monthly_rate_xaf))} per month</>}
          {form.pickup_locations && <><br />Pick-up: {form.pickup_locations}</>}
          <p style={{ color: 'var(--gray-500)', fontSize: 13 }}>
            The listing is created as a draft — add the six required photos (front, rear, left,
            right, dashboard, seats), then set it to Active from My cars to go live.
          </p>
        </div>
      )}

      {create.isError && <div style={{ marginTop: 12 }}><ErrorNote>{(create.error as Error).message}</ErrorNote></div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
        <Button variant="outline" size="sm" onClick={() => (step === 0 ? onDone() : setStep(step - 1))}>
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step < 2 ? (
          <Button size="sm" disabled={step === 0 ? !detailsOk : !pricingOk} onClick={() => setStep(step + 1)}>
            Continue
          </Button>
        ) : (
          <Button size="sm" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create listing'}
          </Button>
        )}
      </div>
    </Card>
  );
}

// --- Documents -------------------------------------------------------------------

/** Business/identity paperwork — scoped to the vendor. One of these unblocks review. */
const BUSINESS_DOCS = [
  { type: 'rccm', label: 'RCCM (business registration)' },
  { type: 'national_id', label: 'National ID — if the business is not registered' },
  { type: 'passport', label: 'Passport — alternative identity document' },
] as const;

/** Car paperwork — each certificate legally covers one car. */
const VEHICLE_DOCS = [
  { type: 'carte_grise', label: 'Carte grise (registration)', expires: false },
  { type: 'insurance', label: 'Insurance certificate', expires: true },
  { type: 'roadworthiness', label: 'Roadworthiness inspection', expires: true },
] as const;

const sectionTitle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontWeight: 700,
  fontSize: 20,
  margin: '28px 0 4px',
};

function Documents({ asVendor }: { asVendor?: Vendor }) {
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
      <h1 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 32 }}>Verification documents</h1>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 6 }}>
        {asVendor ? (
          <>
            {asVendor.business_name}&rsquo;s paperwork. Upload what the team has collected, then
            approve or reject in{' '}
            <Link to="/admin/documents" style={{ color: 'var(--gold-600)', fontWeight: 600 }}>the review queue</Link>.
          </>
        ) : (
          'Upload each document — the Karu team reviews within one business day. Re-uploading restarts a review.'
        )}
      </p>
      {isLoading && <Spinner />}

      {asVendor && docs && cars && (
        <VerificationChecklist vendor={asVendor} docs={docs} cars={cars} />
      )}

      <h2 style={sectionTitle}>Business &amp; identity</h2>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)', margin: '0 0 12px' }}>
        Provide the RCCM — or a national ID or passport if the business is not registered.
      </p>
      <Card style={{ maxWidth: 640 }}>
        {BUSINESS_DOCS.map((d, i) => (
          <DocRow
            key={d.type}
            first={i === 0}
            label={d.label}
            doc={findDoc(d.type)}
            pending={upload.isPending}
            onUpload={(file) => upload.mutate({ type: d.type, file })}
          />
        ))}
      </Card>

      <h2 style={sectionTitle}>Per-vehicle documents</h2>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)', margin: '0 0 12px' }}>
        Each car needs its carte grise, a valid insurance certificate and a roadworthiness inspection.
      </p>
      {cars?.length === 0 && (
        <EmptyState title="No cars yet" hint="Add a car first — its paperwork is uploaded here afterwards." />
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
                label={d.label}
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
          <h2 style={sectionTitle}>Fleet-wide documents (legacy)</h2>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)', margin: '0 0 12px' }}>
            Uploaded before paperwork was tracked per car. New uploads go on the car they cover.
          </p>
          <Card style={{ maxWidth: 640 }}>
            {legacyDocs.map((d, i) => (
              <DocRow
                key={d.id}
                first={i === 0}
                label={VEHICLE_DOCS.find((v) => v.type === d.type)?.label ?? d.type}
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
          Document received — pending review ✓
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
        Verification status <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--gray-500)' }}>(internal)</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={row}>{tick(identityVerified)} Identity verified</div>
        <div style={row}>
          {tick(businessVerified)} Business verified (RCCM)
          {!businessVerified && identityVerified && (
            <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>— operating on an identity document</span>
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
                  registration {approved('carte_grise', car.id) ? '✓' : '☐'} · insurance{' '}
                  {approved('insurance', car.id) ? '✓' : '☐'} · roadworthiness{' '}
                  {approved('roadworthiness', car.id) ? '✓' : '☐'} · photos {6 - photosMissing}/6
                </span>
              </span>
            </div>
          );
        })}
        {cars.length === 0 && (
          <div style={{ ...row, color: 'var(--gray-500)' }}>No cars yet — vehicle checks appear per car.</div>
        )}
        <div style={row}>{tick(vendor.status === 'verified')} Vendor approved</div>
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
            {doc ? doc.status : 'not uploaded'}
            {doc?.expires_at && (
              <span style={{ fontWeight: 500, color: 'var(--gray-500)' }}> · until {prettyDate(doc.expires_at)}</span>
            )}
          </span>
          {onUpload && withExpiry && (
            <input
              type="date"
              aria-label={`${label} expiry date`}
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
              {pending ? 'Uploading…' : doc?.status === 'rejected' ? 'Re-upload' : doc ? 'Replace' : 'Upload'}
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
          {doc.notes ? <>Reviewer&rsquo;s note: {doc.notes}</> : 'Rejected — upload a clearer or more recent document.'}
        </p>
      )}
    </div>
  );
}
