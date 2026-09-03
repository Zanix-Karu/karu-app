import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Booking, BookingStatus, Vehicle, Vendor } from '@karu/shared';
import { api } from '../lib/api';
import { PhotoStrip } from '../components/PhotoStrip';
import { PhotoSlots, extraPhotos } from '../components/PhotoSlots';
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

type Tab = 'overview' | 'vendors' | 'documents' | 'cars' | 'bookings' | 'chats';

const TAB_PATH: Record<Tab, string> = {
  overview: '/admin',
  vendors: '/admin/vendors',
  documents: '/admin/documents',
  cars: '/admin/cars',
  bookings: '/admin/bookings',
  chats: '/admin/chats',
};

/** Tab comes from the URL so the header nav and the console agree. */
function tabFromPath(pathname: string): Tab {
  const rest = pathname.replace(/^\/admin\/?/, '');
  return (
    (['vendors', 'documents', 'cars', 'bookings', 'chats'] as Tab[]).find((t) =>
      rest.startsWith(t),
    ) ?? 'overview'
  );
}

export function AdminScreen() {
  const { t } = useTranslation();
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
      <h1 className="font-display text-3xl font-bold">{t('admin.title')}</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {tabBtn('overview', t('admin.tabs.overview'))}
        {tabBtn('vendors', t('admin.tabs.vendors'))}
        {tabBtn('documents', t('admin.tabs.documents'))}
        {tabBtn('cars', t('admin.tabs.cars'))}
        {tabBtn('bookings', t('admin.tabs.bookings'))}
        {tabBtn('chats', t('admin.tabs.chats'))}
      </div>
      <div className="mt-6">
        {tab === 'overview' && <Overview />}
        {tab === 'vendors' && <Vendors />}
        {tab === 'documents' && <Documents />}
        {tab === 'cars' && <Cars />}
        {tab === 'bookings' && <Bookings />}
        {tab === 'chats' && <Chats />}
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
  pendingDocuments: number;
  staleRequests: number;
  replyWindowHours: number;
  openAssistance: number;
}

function Overview() {
  const { t } = useTranslation();
  // Reuses the Chats tab's query rather than adding a second aggregation on the
  // API: react-query serves it from cache when that tab has already been open.
  const { data: conversations } = useQuery({
    queryKey: ['admin-conversations'],
    queryFn: () => api<Array<{ unread_count: number }>>('/messages/admin/conversations'),
  });
  const unansweredChats = (conversations ?? []).filter((c) => c.unread_count > 0).length;

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

  // FEAT-6: one line at the top for anything actually decaying, so the console
  // says what needs doing rather than only what exists. Counters alone do not
  // distinguish "three requests came in" from "three requests are about to
  // breach the reply window".
  const alerts = [
    data.openAssistance > 0 &&
      t('admin.overview.alertAssistance', { count: data.openAssistance }),
    data.staleRequests > 0 &&
      t('admin.overview.alertStale', {
        count: data.staleRequests,
        hours: data.replyWindowHours,
      }),
    data.pendingDocuments > 0 &&
      t('admin.overview.alertDocuments', { count: data.pendingDocuments }),
    data.pendingVendors > 0 &&
      t('admin.overview.alertVendors', { count: data.pendingVendors }),
    unansweredChats > 0 && t('admin.overview.alertChats', { count: unansweredChats }),
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <Card className="border-l-4 border-karu-terracotta p-4">
          <p className="text-sm font-semibold">{t('admin.overview.needsAttention')}</p>
          <ul className="mt-2 space-y-1 text-sm text-karu-mute">
            {alerts.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stat(t('admin.overview.requests'), data.requestedBookings, true)}
        {stat(t('admin.overview.pendingVendors'), data.pendingVendors, true)}
        {stat(t('admin.overview.pendingDocuments'), data.pendingDocuments, true)}
        {stat(t('admin.overview.activeCars'), data.activeVehicles)}
        {stat(t('admin.overview.customers'), data.customers)}
      </div>
    </div>
  );
}

// --- Vendors ----------------------------------------------------------------

function Vendors() {
  const { t } = useTranslation();
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

  const emptyForm = {
    business_name: '',
    full_name: '',
    contact_email: '',
    contact_phone: '',
    whatsapp_number: '',
    address: '',
    rccm_number: '',
    city: 'douala',
    locale: 'fr',
  };
  const [form, setForm] = useState(emptyForm);
  const createVendor = useMutation({
    mutationFn: () =>
      api<Vendor>('/admin/vendors', {
        method: 'POST',
        body: JSON.stringify({
          business_name: form.business_name,
          contact_email: form.contact_email,
          city: form.city,
          locale: form.locale,
          full_name: form.full_name || undefined,
          contact_phone: form.contact_phone || undefined,
          whatsapp_number: form.whatsapp_number || undefined,
          address: form.address || undefined,
          rccm_number: form.rccm_number || undefined,
        }),
      }),
    onSuccess: () => {
      setForm(emptyForm);
      void qc.invalidateQueries({ queryKey: ['admin-vendors'] });
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <Field label={t('admin.filterStatus')} className="max-w-48">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('admin.all')}</option>
            <option value="pending">{t('vendor.status.pending')}</option>
            <option value="verified">{t('vendor.status.verified')}</option>
            <option value="rejected">{t('vendor.status.rejected')}</option>
            <option value="suspended">{t('vendor.status.suspended')}</option>
          </Select>
        </Field>

        {isLoading && <Spinner />}
        {data?.length === 0 && <EmptyState title={t('admin.vendors.none')} />}
        <div className="mt-4 space-y-3">
          {data?.map((v) => (
            <Card key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{v.business_name}</p>
                <p className="text-xs text-karu-mute">
                  {CITY_LABEL[v.city]} · {v.contact_email ?? t('admin.vendors.noEmail')} ·{' '}
                  {v.contact_phone ?? t('admin.vendors.noPhone')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-karu-ink/5 px-2.5 py-0.5 text-xs font-semibold">
                  {t(`vendor.status.${v.status}`)}
                </span>
                {v.status !== 'verified' && (
                  <Button onClick={() => setVendorStatus.mutate({ id: v.id, status: 'verified' })}>
                    {t('admin.vendors.verify')}
                  </Button>
                )}
                {v.status === 'pending' && (
                  <Button
                    variant="danger"
                    onClick={() => setVendorStatus.mutate({ id: v.id, status: 'rejected' })}
                  >
                    {t('admin.vendors.reject')}
                  </Button>
                )}
                {v.status === 'verified' && (
                  <Button
                    variant="outline"
                    onClick={() => setVendorStatus.mutate({ id: v.id, status: 'suspended' })}
                  >
                    {t('admin.vendors.suspend')}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card className="h-fit p-5">
        <h2 className="font-display text-lg font-bold">{t('admin.vendors.onboardTitle')}</h2>
        <p className="mt-1 text-xs text-karu-mute">{t('admin.vendors.onboardSub')}</p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            createVendor.mutate();
          }}
        >
          <Field label={t('auth.businessName')}>
            <Input
              required
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
            />
          </Field>
          <Field label={t('admin.vendors.contactPerson')}>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </Field>
          <Field label={t('admin.vendors.contactEmail')}>
            <Input
              type="email"
              required
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            />
          </Field>
          <Field label={t('admin.vendors.phone')}>
            <Input
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            />
          </Field>
          <Field label={t('admin.vendors.whatsapp')}>
            <Input
              value={form.whatsapp_number}
              onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
            />
          </Field>
          <Field label={t('admin.vendors.address')}>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label={t('admin.vendors.rccm')}>
            <Input
              value={form.rccm_number}
              onChange={(e) => setForm({ ...form, rccm_number: e.target.value })}
            />
          </Field>
          <Field label={t('vendor.form.city')}>
            <Select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
              <option value="douala">{t('city.douala')}</option>
              <option value="yaounde">{t('city.yaounde')}</option>
              <option value="other">{t('city.other')}</option>
            </Select>
          </Field>
          <Field label={t('admin.vendors.language')}>
            <Select value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </Select>
          </Field>
          {createVendor.isError && <ErrorNote>{(createVendor.error as Error).message}</ErrorNote>}
          <Button type="submit" disabled={createVendor.isPending} className="w-full">
            {createVendor.isPending ? t('admin.vendors.creating') : t('admin.vendors.create')}
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
  expires_at: string | null;
  notes: string | null;
  vendors: { business_name: string } | null;
  vehicles: { make: string; model: string; registration_number: string | null } | null;
};

function Documents() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState('pending');
  const [opening, setOpening] = useState<string | null>(null);
  // Rejections carry a note back to the vendor — armed per card so the
  // reviewer types the reason right where they clicked.
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-documents', status],
    queryFn: () => api<AdminDocument[]>(`/admin/documents${status ? `?status=${status}` : ''}`),
  });

  const review = useMutation({
    mutationFn: ({ id, decision, notes }: { id: string; decision: 'approved' | 'rejected'; notes?: string }) =>
      api(`/admin/documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: decision, notes: notes || undefined }),
      }),
    onSuccess: () => {
      setRejecting(null);
      setNote('');
      void qc.invalidateQueries({ queryKey: ['admin-documents'] });
    },
  });

  return (
    <div>
      <Field label={t('admin.filterStatus')} className="max-w-48">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">{t('vendor.docs.status.pending')}</option>
          <option value="approved">{t('vendor.docs.status.approved')}</option>
          <option value="rejected">{t('vendor.docs.status.rejected')}</option>
          <option value="">{t('admin.all')}</option>
        </Select>
      </Field>

      {isLoading && <Spinner />}
      {data?.length === 0 && <EmptyState title={t('admin.docs.none')} hint={t('admin.docs.noneHint')} />}

      <div className="mt-4 space-y-3">
        {data?.map((d) => (
          <Card key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">
                {t(`vendor.docs.type.${d.type}`)} — {d.vendors?.business_name ?? t('admin.docs.unknownVendor')}
              </p>
              <p className="text-xs text-karu-mute">
                {d.vehicles && (
                  <>
                    {d.vehicles.make} {d.vehicles.model}
                    {d.vehicles.registration_number ? ` · ${d.vehicles.registration_number}` : ''} ·{' '}
                  </>
                )}
                {new Date(d.created_at).toLocaleString()} · {t(`vendor.docs.status.${d.status}`)}
                {d.expires_at && (
                  <> · {t('admin.docs.expires', { date: new Date(d.expires_at).toLocaleDateString() })}</>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
                {opening === d.id ? t('admin.docs.opening') : t('admin.docs.view')}
              </Button>
              {d.status === 'pending' && rejecting !== d.id && (
                <>
                  <Button onClick={() => review.mutate({ id: d.id, decision: 'approved' })}>
                    {t('admin.docs.approve')}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setRejecting(d.id);
                      setNote('');
                    }}
                  >
                    {t('admin.docs.reject')}
                  </Button>
                </>
              )}
              {rejecting === d.id && (
                <>
                  <Input
                    autoFocus
                    placeholder={t('admin.docs.reasonPlaceholder')}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-56"
                  />
                  <Button
                    variant="danger"
                    disabled={review.isPending}
                    onClick={() => review.mutate({ id: d.id, decision: 'rejected', notes: note })}
                  >
                    {t('admin.docs.confirmReject')}
                  </Button>
                  <Button variant="outline" onClick={() => setRejecting(null)}>
                    {t('admin.docs.cancel')}
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
  const { t } = useTranslation();
  const qc = useQueryClient();
  // Every vendor can hold cars; only verified vendors' cars reach customers.
  const { data: vendors } = useQuery({
    queryKey: ['admin-vendors', ''],
    queryFn: () => api<Vendor[]>('/admin/vendors'),
  });
  // The whole fleet, drafts included — the public browse would hide exactly
  // the listings an admin needs to publish.
  const { data: cars, isLoading } = useQuery({
    queryKey: ['admin-cars'],
    queryFn: () => api<Vehicle[]>('/vehicles/mine'),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Vehicle['status'] }) =>
      api<Vehicle>(`/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-cars'] }),
  });

  const [form, setForm] = useState({
    vendor_id: '',
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

  const createCar = useMutation({
    mutationFn: () =>
      api<Vehicle>('/admin/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          vendor_id: form.vendor_id,
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
                  {vendors?.find((v) => v.id === c.vendor_id)?.business_name ?? '—'} ·{' '}
                  {CITY_LABEL[c.city]} · {CATEGORY_LABEL[c.category]} · {xaf(c.daily_rate_xaf)}/
                  {t('vendor.cars.dayShort')} · {t('admin.cars.photos', { count: c.photos.length })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    c.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-karu-ink/5 text-karu-mute'
                  }`}
                >
                  {t(`vendor.cars.status.${c.status}`)}
                </span>
                <Button
                  variant={c.status === 'active' ? 'outline' : 'primary'}
                  disabled={setStatus.isPending}
                  onClick={() =>
                    setStatus.mutate({ id: c.id, status: c.status === 'active' ? 'inactive' : 'active' })
                  }
                >
                  {c.status === 'active' ? t('admin.cars.takeOffline') : t('admin.cars.publish')}
                </Button>
                {/*
                  UX-3: activating a car with fewer than six photos returns a
                  400 naming exactly which angles are missing, and the button
                  used to swallow it — the click simply did nothing. Scoped to
                  the row that failed, since the mutation is shared by the list.
                */}
                {setStatus.isError && setStatus.variables?.id === c.id && (
                  <div className="w-full">
                    <ErrorNote>{(setStatus.error as Error).message}</ErrorNote>
                  </div>
                )}
                <label className="cursor-pointer rounded-full border-[1.5px] border-karu-ink px-4 py-1.5 text-sm font-semibold hover:bg-karu-ink hover:text-karu-cream">
                  {uploadPhoto.isPending ? t('admin.cars.uploading') : t('admin.cars.photo')}
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
              </div>
              <div className="w-full">
                <PhotoSlots
                  vehicleId={c.id}
                  angles={c.photo_angles ?? {}}
                  onChanged={() => qc.invalidateQueries({ queryKey: ['admin-cars'] })}
                />
                <PhotoStrip
                  vehicleId={c.id}
                  photos={extraPhotos(c)}
                  onChanged={() => qc.invalidateQueries({ queryKey: ['admin-cars'] })}
                />
              </div>
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
        <h2 className="font-display text-lg font-bold">{t('admin.cars.addTitle')}</h2>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            createCar.mutate();
          }}
        >
          <Field label={t('admin.cars.vendor')}>
            <Select
              required
              value={form.vendor_id}
              onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
            >
              <option value="">{t('admin.cars.chooseVendor')}</option>
              {vendors?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.business_name}
                  {v.status !== 'verified' ? ` (${t(`vendor.status.${v.status}`)})` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('vendor.form.make')}>
              <Input required value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
            </Field>
            <Field label={t('vendor.form.model')}>
              <Input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </Field>
            <Field label={t('vendor.form.year')}>
              <Input
                type="number"
                min={1980}
                required
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
              />
            </Field>
            <Field label={t('vendor.form.seats')}>
              <Input
                type="number"
                min={1}
                required
                value={form.seats}
                onChange={(e) => setForm({ ...form, seats: e.target.value })}
              />
            </Field>
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
                {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('vendor.form.gearbox')}>
              <Select
                value={form.transmission}
                onChange={(e) => setForm({ ...form, transmission: e.target.value })}
              >
                <option value="manual">{t('common.manual')}</option>
                <option value="automatic">{t('common.automatic')}</option>
              </Select>
            </Field>
            <Field label={t('admin.cars.dailyRate')}>
              <Input
                type="number"
                min={1}
                required
                value={form.daily_rate_xaf}
                onChange={(e) => setForm({ ...form, daily_rate_xaf: e.target.value })}
              />
            </Field>
            <Field label={t('vendor.form.city')}>
              <Select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
                <option value="douala">{t('city.douala')}</option>
                <option value="yaounde">{t('city.yaounde')}</option>
                <option value="other">{t('city.other')}</option>
              </Select>
            </Field>
            <Field label={t('admin.cars.weeklyRate')}>
              <Input
                type="number"
                min={1}
                value={form.weekly_rate_xaf}
                onChange={(e) => setForm({ ...form, weekly_rate_xaf: e.target.value })}
              />
            </Field>
            <Field label={t('admin.cars.monthlyRate')}>
              <Input
                type="number"
                min={1}
                value={form.monthly_rate_xaf}
                onChange={(e) => setForm({ ...form, monthly_rate_xaf: e.target.value })}
              />
            </Field>
            <Field label={t('vendor.form.driver')}>
              <Select
                value={form.driver_option}
                onChange={(e) => setForm({ ...form, driver_option: e.target.value })}
              >
                <option value="none">{t('vendor.form.driverNone')}</option>
                <option value="optional">{t('admin.cars.driverOptional')}</option>
                <option value="required">{t('admin.cars.driverRequired')}</option>
              </Select>
            </Field>
            {form.driver_option !== 'none' && (
              <Field label={t('admin.cars.driverRate')}>
                <Input
                  type="number"
                  min={1}
                  required
                  value={form.driver_daily_rate_xaf}
                  onChange={(e) => setForm({ ...form, driver_daily_rate_xaf: e.target.value })}
                />
              </Field>
            )}
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
          <Button type="submit" loading={createCar.isPending} className="w-full">
            Add car (draft, publish after photos)
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

// --- Chats ------------------------------------------------------------------

interface Conversation {
  booking_id: string;
  reference: string | null;
  booking_status: BookingStatus;
  customer_name: string;
  vendor_name: string;
  message_count: number;
  unread_count: number;
  any_redacted: boolean;
  last_message: { sender_role: string; body: string; created_at: string } | null;
}

const SENDER_LABEL: Record<string, string> = {
  customer: 'Customer',
  vendor: 'Provider',
  admin: 'Karu Support',
};

/**
 * Every conversation on the platform — the oversight half of admin
 * intervention. Opening one lands on the booking detail, where the admin
 * posts into the same thread as Karu Support.
 */
function Chats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-conversations'],
    queryFn: () => api<Conversation[]>('/admin/conversations'),
    refetchInterval: 10000,
    // Keep the oversight list live even when the console window isn't focused.
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorNote>{(error as Error).message}</ErrorNote>;
  if (!data || data.length === 0) {
    return <EmptyState title="No conversations yet" />;
  }

  return (
    <div className="space-y-3">
      {data.map((c) => (
        <Link key={c.booking_id} to={`/bookings/${c.booking_id}`} className="block">
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-karu-ink/5">
            <div className="min-w-0">
              <p className="font-mono text-xs text-karu-mute">{c.reference ?? c.booking_id}</p>
              <p className="mt-0.5 font-semibold">
                {c.customer_name} ↔ {c.vendor_name}
              </p>
              {c.last_message && (
                <p className="mt-0.5 max-w-xl truncate text-sm text-karu-mute">
                  {SENDER_LABEL[c.last_message.sender_role] ?? c.last_message.sender_role}:{' '}
                  {c.last_message.body}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {c.unread_count > 0 && (
                <span className="rounded-full bg-karu-terracotta px-2.5 py-0.5 text-xs font-bold text-white">
                  {c.unread_count} new
                </span>
              )}
              {c.any_redacted && (
                <span
                  className="rounded-full bg-karu-yellow/40 px-2.5 py-0.5 text-xs font-semibold text-karu-brown"
                  title="Contact details were removed from at least one message in this thread"
                >
                  redactions
                </span>
              )}
              <span className="text-xs text-karu-mute">
                {c.message_count} message{c.message_count === 1 ? '' : 's'}
              </span>
              <StatusBadge status={c.booking_status} />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function Bookings() {
  const { t } = useTranslation();
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
              {t(`status.${s}`)}
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

            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={b.status} />
              <Link to={`/bookings/${b.id}`}>
                <Button variant="outline">View details</Button>
              </Link>
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
