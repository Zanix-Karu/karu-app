import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MAX_INSPECTION_PHOTOS,
  MIN_INSPECTION_PHOTOS,
  type BookingInspection,
  type InspectionStage,
} from '@karu/shared';
import { api } from '../lib/api';
import { Button, Card } from '../ds';
import { ErrorNote } from '../ui';

type InspectionWithUrls = BookingInspection & { photo_urls: string[] };

/**
 * Condition reports (0030): what the car looked like when it changed hands.
 *
 * The provider has to file one before entering the handover or return code
 * (the API refuses otherwise); the customer can file their own as their side
 * of the record. Both sides see both reports, which is the point: a dispute
 * about a scratch is settled by the photos, not by who shouts louder.
 */
export function InspectionPanel({
  bookingId,
  view,
  stage,
  required,
}: {
  bookingId: string;
  view: string;
  /** The stage the caller can record now, or null if only viewing. */
  stage: InspectionStage | null;
  /** True when the provider must file this before the code step. */
  required: boolean;
}) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['inspections', bookingId],
    queryFn: () => api<InspectionWithUrls[]>(`/bookings/${bookingId}/inspections`),
  });

  const role = view === 'admin' ? null : view;
  const mine = stage && role ? data?.find((r) => r.stage === stage && r.recorded_role === role) : undefined;
  const [editing, setEditing] = useState(false);

  if (!data) return null;
  if (!stage && data.length === 0) return null;

  return (
    <div id="condition">
    <Card style={{ marginTop: 16 }}>
      <h2 className="font-display text-lg font-bold">{t('inspection.title')}</h2>
      <p className="mt-1 text-sm text-karu-mute">{t('inspection.sub')}</p>

      {data.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 karu-stagger">
          {data.map((r) => (
            <InspectionSummary key={r.id} report={r} />
          ))}
        </div>
      )}

      {/* The customer's report is optional, so it starts folded away. */}
      {stage && role === 'customer' && !mine && !editing && (
        <Button variant="outline" className="mt-4" onClick={() => setEditing(true)}>
          {t('inspection.addMine')}
        </Button>
      )}
      {stage && role && ((!mine && role !== 'customer') || editing) && (
        <InspectionForm
          bookingId={bookingId}
          stage={stage}
          role={role}
          required={required && !mine}
          onDone={() => setEditing(false)}
        />
      )}
      {stage && role && mine && !editing && (
        <Button variant="outline" className="mt-4" onClick={() => setEditing(true)}>
          {t('inspection.redo')}
        </Button>
      )}
    </Card>
    </div>
  );
}

function InspectionSummary({ report }: { report: InspectionWithUrls }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-karu-ink/10 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-karu-mute">
        {t(`inspection.stage.${report.stage}`)} · {t(`inspection.by.${report.recorded_role}`)}
      </p>
      <div className="karu-inspection-photos mt-2">
        {report.photo_urls.map((url, i) => (
          <a key={url} href={url} target="_blank" rel="noreferrer">
            <img src={url} alt={t('inspection.photoAlt', { n: i + 1 })} loading="lazy" />
          </a>
        ))}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 text-sm">
        {report.fuel_eighths !== null && (
          <>
            <dt className="text-karu-mute">{t('inspection.fuel')}</dt>
            <dd className="text-right font-semibold">{t('inspection.fuelValue', { n: report.fuel_eighths })}</dd>
          </>
        )}
        {report.odometer_km !== null && (
          <>
            <dt className="text-karu-mute">{t('inspection.odometer')}</dt>
            <dd className="text-right font-semibold">{report.odometer_km.toLocaleString()} km</dd>
          </>
        )}
      </dl>
      {report.notes && <p className="mt-2 text-sm">&ldquo;{report.notes}&rdquo;</p>}
    </div>
  );
}

function InspectionForm({
  bookingId,
  stage,
  role,
  required,
  onDone,
}: {
  bookingId: string;
  stage: InspectionStage;
  role: string;
  required: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [photos, setPhotos] = useState<Array<{ path: string; preview: string }>>([]);
  const [fuel, setFuel] = useState<number | ''>('');
  const [odometer, setOdometer] = useState('');
  const [notes, setNotes] = useState('');

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const room = MAX_INSPECTION_PHOTOS - photos.length;
      const added: Array<{ path: string; preview: string }> = [];
      for (const file of files.slice(0, room)) {
        const res = await api<{ signedUrl: string; path: string }>(
          `/bookings/${bookingId}/inspections/upload`,
          { method: 'POST', body: JSON.stringify({ file_name: file.name }) },
        );
        const put = await fetch(res.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!put.ok) throw new Error(t('inspection.uploadFailed'));
        added.push({ path: res.path, preview: URL.createObjectURL(file) });
      }
      return added;
    },
    onSuccess: (added) => setPhotos((p) => [...p, ...added]),
  });

  const save = useMutation({
    mutationFn: () =>
      api(`/bookings/${bookingId}/inspections`, {
        method: 'POST',
        body: JSON.stringify({
          stage,
          photo_paths: photos.map((p) => p.path),
          fuel_eighths: fuel === '' ? undefined : fuel,
          odometer_km: odometer ? Number(odometer) : undefined,
          notes: notes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inspections', bookingId] });
      onDone();
    },
  });

  const enough = photos.length >= MIN_INSPECTION_PHOTOS;

  return (
    <form
      className="mt-4 border-t border-karu-ink/10 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (enough) save.mutate();
      }}
    >
      <p className="font-semibold">
        {role === 'customer'
          ? stage === 'handover'
            ? t('inspection.formCustomerHandover')
            : t('inspection.formCustomerReturn')
          : stage === 'handover'
            ? t('inspection.formHandover')
            : t('inspection.formReturn')}
      </p>
      {required && <p className="mt-1 text-sm text-karu-brown">{t('inspection.requiredHint')}</p>}

      <div className="karu-inspection-photos mt-3">
        {photos.map((p, i) => (
          <img key={p.path} src={p.preview} alt={t('inspection.photoAlt', { n: i + 1 })} className="karu-pop-in" />
        ))}
        {photos.length < MAX_INSPECTION_PHOTOS && (
          <label className="grid aspect-[4/3] cursor-pointer place-items-center rounded-md border-2 border-dashed border-karu-ink/20 text-center text-xs font-semibold text-karu-mute">
            {upload.isPending ? t('common.oneMoment') : t('inspection.addPhotos')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              multiple
              className="sr-only"
              disabled={upload.isPending}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                if (files.length) upload.mutate(files);
              }}
            />
          </label>
        )}
      </div>
      <p className={`mt-1 text-xs ${enough ? 'text-green-700' : 'text-karu-mute'}`}>
        {t('inspection.photoCount', { count: photos.length, min: MIN_INSPECTION_PHOTOS })}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-karu-mute">
            {t('inspection.fuel')}
          </span>
          <select
            value={fuel}
            onChange={(e) => setFuel(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full rounded-lg border border-karu-ink/15 px-3 py-2 text-sm"
          >
            <option value="">{t('inspection.fuelPick')}</option>
            {Array.from({ length: 9 }, (_, n) => (
              <option key={n} value={n}>
                {t('inspection.fuelValue', { n })}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-karu-mute">
            {t('inspection.odometer')}
          </span>
          <input
            inputMode="numeric"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value.replace(/\D/g, '').slice(0, 7))}
            placeholder="84 250"
            className="w-full rounded-lg border border-karu-ink/15 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-karu-mute">
          {t('inspection.notes')}
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
          rows={2}
          placeholder={t('inspection.notesPlaceholder')}
          className="w-full rounded-lg border border-karu-ink/15 px-3 py-2 text-sm"
        />
      </label>

      <Button type="submit" className="mt-3" disabled={!enough} loading={save.isPending}>
        {t('inspection.save')}
      </Button>
      {(upload.isError || save.isError) && (
        <div className="mt-2">
          <ErrorNote>{((upload.error ?? save.error) as Error).message}</ErrorNote>
        </div>
      )}
    </form>
  );
}
