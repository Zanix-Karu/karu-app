import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Booking, BookingStatus, Vehicle, Vendor } from '@karu/shared';
import { api } from '../lib/api';
import { CATEGORY_LABEL, CITY_LABEL, prettyDate, xaf } from '../lib/format';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Select,
  Spinner,
  StatusBadge,
} from '../ui';

type Tab = 'overview' | 'vendors' | 'documents' | 'cars' | 'bookings';

const TAB_PATH: Record<Tab, string> = {
  overview: '/admin',
  vendors: '/admin/vendors',
  documents: '/admin/documents',
  cars: '/admin/cars',
  bookings: '/admin/bookings',
};

/** Tab comes from the URL so the header nav and the console agree. */
function tabFromPath(pathname: string): Tab {
  const rest = pathname.replace(/^\/admin\/?/, '');
  return (['vendors', 'documents', 'cars', 'bookings'] as Tab[]).find((t) => rest.startsWith(t)) ?? 'overview';
}

export function AdminScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = tabFromPath(location.pathname);

  const tabBtn = (t: Tab, label: string) => (
    <button
      key={t}
      onClick={() => navigate(TAB_PATH[t])}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        tab === t ? 'bg-karu-ink text-karu-cream' : 'text-karu-brown hover:bg-karu-ink/5'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Karu operations</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {tabBtn('overview', 'Overview')}
        {tabBtn('vendors', 'Vendors')}
        {tabBtn('documents', 'Documents')}
        {tabBtn('cars', 'Cars')}
        {tabBtn('bookings', 'Bookings')}
      </div>
      <div className="mt-6">
        {tab === 'overview' && <Overview />}
        {tab === 'vendors' && <Vendors />}
        {tab === 'documents' && <Documents />}
        {tab === 'cars' && <Cars />}
        {tab === 'bookings' && <Bookings />}
      </div>
    </div>
  );
}

// --- Overview ---------------------------------------------------------------

interface OverviewData {
  pendingVendors: number;
  requestedBookings: number;
  activeVehicles: number;
  customers: number;
}

function Overview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api<OverviewData>('/admin/overview'),
  });
  if (isLoading) return <Spinner />;
  if (error) return <ErrorNote>{(error as Error).message}</ErrorNote>;
  if (!data) return null;

  const stat = (label: string, value: number, urgent = false) => (
    <Card className="p-5">
      <p className={`font-display text-4xl font-bold ${urgent && value > 0 ? 'text-karu-terracotta' : ''}`}>
        {value}
      </p>
      <p className="mt-1 text-sm text-karu-mute">{label}</p>
    </Card>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stat('Booking requests awaiting action', data.requestedBookings, true)}
      {stat('Vendors awaiting verification', data.pendingVendors, true)}
      {stat('Active cars', data.activeVehicles)}
      {stat('Customers', data.customers)}
    </div>
  );
}

// --- Vendors ----------------------------------------------------------------

function Vendors() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-vendors', status],
    queryFn: () => api<Vendor[]>(`/admin/vendors${status ? `?status=${status}` : ''}`),
  });

  const setVendorStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/admin/vendors/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-vendors'] }),
  });

  const [form, setForm] = useState({
    business_name: '',
    contact_email: '',
    contact_phone: '',
    city: 'douala',
  });
  const createVendor = useMutation({
    mutationFn: () => api<Vendor>('/admin/vendors', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      setForm({ business_name: '', contact_email: '', contact_phone: '', city: 'douala' });
      void qc.invalidateQueries({ queryKey: ['admin-vendors'] });
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <Field label="Filter by status" className="max-w-48">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </Select>
        </Field>

        {isLoading && <Spinner />}
        {data?.length === 0 && <EmptyState title="No vendors" />}
        <div className="mt-4 space-y-3">
          {data?.map((v) => (
            <Card key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{v.business_name}</p>
                <p className="text-xs text-karu-mute">
                  {CITY_LABEL[v.city]} · {v.contact_email ?? 'no email'} ·{' '}
                  {v.contact_phone ?? 'no phone'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-karu-ink/5 px-2.5 py-0.5 text-xs font-semibold capitalize">
                  {v.status}
                </span>
                {v.status !== 'verified' && (
                  <Button onClick={() => setVendorStatus.mutate({ id: v.id, status: 'verified' })}>
                    Verify
                  </Button>
                )}
                {v.status === 'pending' && (
                  <Button
                    variant="danger"
                    onClick={() => setVendorStatus.mutate({ id: v.id, status: 'rejected' })}
                  >
                    Reject
                  </Button>
                )}
                {v.status === 'verified' && (
                  <Button
                    variant="outline"
                    onClick={() => setVendorStatus.mutate({ id: v.id, status: 'suspended' })}
                  >
                    Suspend
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card className="h-fit p-5">
        <h2 className="font-display text-lg font-bold">Onboard a vendor</h2>
        <p className="mt-1 text-xs text-karu-mute">
          Creates their account (they sign in later via password reset) and marks them verified.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            createVendor.mutate();
          }}
        >
          <Field label="Business name">
            <Input
              required
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
            />
          </Field>
          <Field label="Contact email">
            <Input
              type="email"
              required
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            />
          </Field>
          <Field label="City">
            <Select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
              <option value="douala">Douala</option>
              <option value="yaounde">Yaoundé</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          {createVendor.isError && <ErrorNote>{(createVendor.error as Error).message}</ErrorNote>}
          <Button type="submit" disabled={createVendor.isPending} className="w-full">
            {createVendor.isPending ? 'Creating…' : 'Create verified vendor'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

// --- Documents ----------------------------------------------------------------

type AdminDocument = {
  id: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  file_path: string;
  created_at: string;
  vendors: { business_name: string } | null;
};

const DOC_LABEL: Record<string, string> = {
  rccm: 'RCCM',
  carte_grise: 'Carte grise',
  insurance: 'Insurance',
  roadworthiness: 'Roadworthiness',
};

function Documents() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('pending');
  const [opening, setOpening] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-documents', status],
    queryFn: () => api<AdminDocument[]>(`/admin/documents${status ? `?status=${status}` : ''}`),
  });

  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approved' | 'rejected' }) =>
      api(`/admin/documents/${id}`, { method: 'PATCH', body: JSON.stringify({ status: decision }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-documents'] }),
  });

  return (
    <div>
      <Field label="Filter by status" className="max-w-48">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </Select>
      </Field>

      {isLoading && <Spinner />}
      {data?.length === 0 && <EmptyState title="No documents" hint="Vendor uploads appear here for review." />}

      <div className="mt-4 space-y-3">
        {data?.map((d) => (
          <Card key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">
                {DOC_LABEL[d.type] ?? d.type} — {d.vendors?.business_name ?? 'unknown vendor'}
              </p>
              <p className="text-xs text-karu-mute">
                {new Date(d.created_at).toLocaleString()} · <span className="capitalize">{d.status}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Reviewing blind is not reviewing — open the file first. */}
              <Button
                variant="outline"
                disabled={opening === d.id}
                onClick={async () => {
                  setOpening(d.id);
                  try {
                    const { url } = await api<{ url: string }>(`/admin/documents/${d.id}/download`);
                    window.open(url, '_blank', 'noopener');
                  } catch (err) {
                    window.alert((err as Error).message);
                  } finally {
                    setOpening(null);
                  }
                }}
              >
                {opening === d.id ? 'Opening…' : 'View document'}
              </Button>
              {d.status === 'pending' && (
                <>
                  <Button onClick={() => review.mutate({ id: d.id, decision: 'approved' })}>Approve</Button>
                  <Button variant="danger" onClick={() => review.mutate({ id: d.id, decision: 'rejected' })}>
                    Reject
                  </Button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
      {review.isError && (
        <div className="mt-3">
          <ErrorNote>{(review.error as Error).message}</ErrorNote>
        </div>
      )}
    </div>
  );
}

// --- Cars -------------------------------------------------------------------

function Cars() {
  const qc = useQueryClient();
  const { data: vendors } = useQuery({
    queryKey: ['admin-vendors', 'verified'],
    queryFn: () => api<Vendor[]>('/admin/vendors?status=verified'),
  });
  const { data: cars, isLoading } = useQuery({
    queryKey: ['admin-cars'],
    queryFn: () => api<Vehicle[]>('/vehicles?sort=newest&limit=50'),
  });

  const [form, setForm] = useState({
    vendor_id: '',
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

  const createCar = useMutation({
    mutationFn: () =>
      api<Vehicle>('/admin/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          vendor_id: form.vendor_id,
          make: form.make,
          model: form.model,
          year: form.year ? Number(form.year) : undefined,
          category: form.category,
          seats: form.seats ? Number(form.seats) : undefined,
          transmission: form.transmission,
          daily_rate_xaf: Number(form.daily_rate_xaf),
          city: form.city,
          pickup_locations: form.pickup_locations
            ? form.pickup_locations.split(',').map((s) => s.trim())
            : [],
          description: form.description || undefined,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-cars'] }),
  });

  const uploadPhoto = useMutation({
    mutationFn: async ({ vehicleId, file }: { vehicleId: string; file: File }) => {
      const upload = await api<{ signedUrl: string; path: string }>(
        `/vehicles/${vehicleId}/photos`,
        { method: 'POST', body: JSON.stringify({ file_name: file.name }) },
      );
      const put = await fetch(upload.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed: ${put.status}`);
      return api(`/vehicles/${vehicleId}/photos/attach`, {
        method: 'POST',
        body: JSON.stringify({ path: upload.path }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-cars'] }),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        {isLoading && <Spinner />}
        <div className="space-y-3">
          {cars?.map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">
                  {c.make} {c.model} {c.year ?? ''}
                </p>
                <p className="text-xs text-karu-mute">
                  {CITY_LABEL[c.city]} · {CATEGORY_LABEL[c.category]} · {xaf(c.daily_rate_xaf)}/day ·{' '}
                  {c.photos.length} photo{c.photos.length === 1 ? '' : 's'}
                </p>
              </div>
              <label className="cursor-pointer rounded-full border-[1.5px] border-karu-ink px-4 py-1.5 text-sm font-semibold hover:bg-karu-ink hover:text-karu-cream">
                {uploadPhoto.isPending ? 'Uploading…' : '+ Photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadPhoto.mutate({ vehicleId: c.id, file });
                    e.target.value = '';
                  }}
                />
              </label>
            </Card>
          ))}
        </div>
        {uploadPhoto.isError && (
          <div className="mt-3">
            <ErrorNote>{(uploadPhoto.error as Error).message}</ErrorNote>
          </div>
        )}
      </div>

      <Card className="h-fit p-5">
        <h2 className="font-display text-lg font-bold">Add a car</h2>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            createCar.mutate();
          }}
        >
          <Field label="Vendor">
            <Select
              required
              value={form.vendor_id}
              onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
            >
              <option value="">Choose…</option>
              {vendors?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.business_name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Make">
              <Input required value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
            </Field>
            <Field label="Model">
              <Input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </Field>
            <Field label="Year">
              <Input
                type="number"
                min={1980}
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
              />
            </Field>
            <Field label="Seats">
              <Input
                type="number"
                min={1}
                value={form.seats}
                onChange={(e) => setForm({ ...form, seats: e.target.value })}
              />
            </Field>
            <Field label="Type">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Gearbox">
              <Select
                value={form.transmission}
                onChange={(e) => setForm({ ...form, transmission: e.target.value })}
              >
                <option value="manual">Manual</option>
                <option value="automatic">Automatic</option>
              </Select>
            </Field>
            <Field label="Rate / day (XAF)">
              <Input
                type="number"
                min={1}
                required
                value={form.daily_rate_xaf}
                onChange={(e) => setForm({ ...form, daily_rate_xaf: e.target.value })}
              />
            </Field>
            <Field label="City">
              <Select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
                <option value="douala">Douala</option>
                <option value="yaounde">Yaoundé</option>
                <option value="other">Other</option>
              </Select>
            </Field>
          </div>
          <Field label="Pick-up points (comma-separated)">
            <Input
              value={form.pickup_locations}
              onChange={(e) => setForm({ ...form, pickup_locations: e.target.value })}
              placeholder="Douala International Airport, Akwa"
            />
          </Field>
          <Field label="Description">
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          {createCar.isError && <ErrorNote>{(createCar.error as Error).message}</ErrorNote>}
          <Button type="submit" disabled={createCar.isPending} className="w-full">
            {createCar.isPending ? 'Adding…' : 'Add car (live immediately)'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

// --- Bookings ---------------------------------------------------------------

const NEXT_ACTIONS: Partial<Record<BookingStatus, Array<{ to: BookingStatus; label: string; danger?: boolean }>>> = {
  requested: [
    { to: 'confirmed', label: 'Confirm' },
    { to: 'rejected', label: 'Reject', danger: true },
  ],
  confirmed: [
    { to: 'in_progress', label: 'Start trip' },
    { to: 'cancelled', label: 'Cancel', danger: true },
  ],
  in_progress: [{ to: 'completed', label: 'Complete' }],
};

function Bookings() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-bookings', status],
    queryFn: () => api<Booking[]>(`/admin/bookings${status ? `?status=${status}` : ''}`),
  });

  const transition = useMutation({
    mutationFn: ({ id, to }: { id: string; to: BookingStatus }) =>
      api(`/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: to }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-bookings'] }),
  });

  return (
    <div>
      <Field label="Filter by status" className="max-w-48">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {['requested', 'confirmed', 'in_progress', 'completed', 'rejected', 'cancelled'].map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </Select>
      </Field>

      {isLoading && <Spinner />}
      {data?.length === 0 && <EmptyState title="No bookings" />}

      <div className="mt-4 space-y-3">
        {data?.map((b) => (
          <Card key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-mono text-xs text-karu-mute">{b.reference ?? b.id}</p>
              <p className="mt-0.5 font-semibold">
                {prettyDate(b.start_date)} → {prettyDate(b.end_date)} · {xaf(b.total_xaf)}
              </p>
              {b.customer_note && <p className="text-xs text-karu-mute">“{b.customer_note}”</p>}
              <Link to={`/bookings/${b.id}`} className="mt-1 inline-block text-xs font-semibold text-karu-brown underline">
                View details
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={b.status} />
              {NEXT_ACTIONS[b.status]?.map((a) => (
                <Button
                  key={a.to}
                  variant={a.danger ? 'danger' : 'primary'}
                  disabled={transition.isPending}
                  onClick={() => transition.mutate({ id: b.id, to: a.to })}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {transition.isError && (
        <div className="mt-3">
          <ErrorNote>{(transition.error as Error).message}</ErrorNote>
        </div>
      )}
    </div>
  );
}
