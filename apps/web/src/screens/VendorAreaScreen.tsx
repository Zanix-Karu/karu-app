import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Booking, BookingStatus, Vehicle, Vendor, VendorDocument } from '@karu/shared';
import { api } from '../lib/api';
import { CATEGORY_LABEL, CITY_LABEL, prettyDate, xaf } from '../lib/format';
import { Badge, Button, Card, Field, Input, Select, SidebarNav, StatCard, StepNav } from '../ds';
import { EmptyState, ErrorNote, Spinner, StatusBadge } from '../ui';

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
  const section = sectionFromPath(location.pathname);

  const { data: vendor, isLoading, error } = useQuery({
    queryKey: ['vendor-me'],
    queryFn: () => api<Vendor>('/vendors/me'),
  });

  if (isLoading) return <Spinner label="Loading your vendor account…" />;
  if (error) return <ErrorNote>{(error as Error).message}</ErrorNote>;
  if (!vendor) return null;

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
            {vendor.business_name}
          </div>
          <Badge variant={vendor.status === 'verified' ? 'success' : 'upcoming'} style={{ marginTop: 8 }}>
            {vendor.status === 'verified' ? '✓ Verified' : `Verification ${vendor.status}`}
          </Badge>
        </div>
        <SidebarNav
          items={NAV}
          active={section}
          onSelect={(k) => navigate(NAV.find((n) => n.key === k)!.path)}
        />
      </div>

      <div>
        {section === 'dashboard' && <Dashboard />}
        {section === 'bookings' && <VendorBookings />}
        {section === 'cars' && <Cars vendorVerified={vendor.status === 'verified'} />}
        {section === 'documents' && <Documents />}
      </div>
    </div>
  );
}

// --- Dashboard ----------------------------------------------------------------

function Dashboard() {
  const { data: bookings } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => api<Booking[]>('/bookings/mine'),
  });
  const { data: cars } = useQuery({
    queryKey: ['my-cars'],
    queryFn: () => api<Vehicle[]>('/vehicles/mine'),
  });

  const stats = useMemo(() => {
    const b = bookings ?? [];
    return {
      earnings: b.filter((x) => x.status === 'completed').reduce((s, x) => s + x.total_xaf, 0),
      requests: b.filter((x) => x.status === 'requested').length,
      upcoming: b.filter((x) => x.status === 'confirmed').length,
      fleet: cars?.length ?? 0,
      active: cars?.filter((c) => c.status === 'active').length ?? 0,
    };
  }, [bookings, cars]);

  const upcoming = (bookings ?? [])
    .filter((b) => b.status === 'confirmed' || b.status === 'in_progress')
    .slice(0, 5);

  return (
    <div>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 32 }}>Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 20 }}>
        <StatCard label="Total earnings (completed)" value={xaf(stats.earnings)} accent />
        <StatCard label="Requests awaiting reply" value={stats.requests} hint="Confirm within 24h" />
        <StatCard label="Upcoming bookings" value={stats.upcoming} />
        <StatCard label="Fleet" value={`${stats.active}/${stats.fleet}`} hint="active / total cars" />
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

function VendorBookings() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => api<Booking[]>('/bookings/mine'),
  });

  const transition = useMutation({
    mutationFn: ({ id, to }: { id: string; to: BookingStatus }) =>
      api<Booking>(`/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: to }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-bookings'] }),
  });

  if (isLoading) return <Spinner label="Loading booking requests…" />;
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
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <StatusBadge status={b.status} />
              {VENDOR_ACTIONS[b.status]?.map((a) => (
                <Button
                  key={a.to}
                  size="sm"
                  variant={a.danger ? 'danger' : 'primary'}
                  disabled={transition.isPending}
                  onClick={() => {
                    if (a.confirm && !window.confirm(a.confirm)) return;
                    transition.mutate({ id: b.id, to: a.to });
                  }}
                >
                  {a.label}
                </Button>
              ))}
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

function Cars({ vendorVerified }: { vendorVerified: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data: cars, isLoading } = useQuery({
    queryKey: ['my-cars'],
    queryFn: () => api<Vehicle[]>('/vehicles/mine'),
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 32 }}>My cars</h1>
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Close' : '+ Add a car'}
        </Button>
      </div>
      {!vendorVerified && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gold-600)', marginTop: 8 }}>
          Your account is awaiting verification — new listings stay drafts until you're verified.
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
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide availability' : 'Availability'}
          </Button>
        </div>
      </div>
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
    daily_rate_xaf: '',
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
          year: form.year ? Number(form.year) : undefined,
          category: form.category,
          seats: form.seats ? Number(form.seats) : undefined,
          transmission: form.transmission,
          daily_rate_xaf: Number(form.daily_rate_xaf),
          city: form.city,
          pickup_locations: form.pickup_locations ? form.pickup_locations.split(',').map((s) => s.trim()) : [],
          description: form.description || undefined,
        }),
      }),
    onSuccess: onDone,
  });

  const detailsOk = form.make && form.model;
  const pricingOk = Number(form.daily_rate_xaf) > 0;

  return (
    <Card style={{ marginTop: 20 }}>
      <StepNav steps={STEPS} current={step} style={{ marginBottom: 22 }} />

      {step === 0 && (
        <div className="karu-form-grid">
          <Field label="Make"><Input required value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} /></Field>
          <Field label="Model"><Input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
          <Field label="Year"><Input type="number" min={1980} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></Field>
          <Field label="Seats"><Input type="number" min={1} value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} /></Field>
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
          {CATEGORY_LABEL[form.category]} · {form.seats || '—'} seats · {form.transmission} · {CITY_LABEL[form.city]}
          <br />
          {form.daily_rate_xaf ? xaf(Number(form.daily_rate_xaf)) : '—'} per day
          {form.pickup_locations && <><br />Pick-up: {form.pickup_locations}</>}
          <p style={{ color: 'var(--gray-500)', fontSize: 13 }}>
            The listing is created as a draft if your account isn't verified yet; photos can be added right after.
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

const DOC_TYPES = [
  { type: 'rccm', label: 'RCCM (business registration)' },
  { type: 'carte_grise', label: 'Carte grise (vehicle registration)' },
  { type: 'insurance', label: 'Insurance certificate' },
  { type: 'roadworthiness', label: 'Roadworthiness inspection' },
] as const;

function Documents() {
  const qc = useQueryClient();
  const upload = useMutation({
    mutationFn: async ({ type, file }: { type: string; file: File }) => {
      const res = await api<{ document: VendorDocument; upload: { signedUrl: string; path: string } }>(
        '/vendors/me/documents',
        { method: 'POST', body: JSON.stringify({ type }) },
      );
      const put = await fetch(res.upload.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) throw new Error(`Upload failed: ${put.status}`);
      return res.document;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-me'] }),
  });

  return (
    <div>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 32 }}>Verification documents</h1>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 6 }}>
        Upload each document — the Karu team reviews within one business day. Re-uploading restarts a review.
      </p>
      <div style={{ display: 'grid', gap: 14, marginTop: 20, maxWidth: 560 }}>
        {DOC_TYPES.map((d) => (
          <Card key={d.type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15 }}>{d.label}</span>
            <label
              style={{
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                fontWeight: 600,
                fontSize: 14,
                padding: '9px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--yellow)',
                color: 'var(--ink)',
              }}
            >
              {upload.isPending ? 'Uploading…' : 'Upload'}
              <input
                type="file"
                accept="image/*,.pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload.mutate({ type: d.type, file: f });
                  e.target.value = '';
                }}
              />
            </label>
          </Card>
        ))}
      </div>
      {upload.isError && <div style={{ marginTop: 12 }}><ErrorNote>{(upload.error as Error).message}</ErrorNote></div>}
      {upload.isSuccess && (
        <p style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--success)', marginTop: 12 }}>
          Document received — pending review ✓
        </p>
      )}
    </div>
  );
}
