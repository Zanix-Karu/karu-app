import { useMutation } from '@tanstack/react-query';
import { PHOTO_ANGLES, type PhotoAngle, type Vehicle } from '@karu/shared';
import { api } from '../lib/api';

const ANGLE_LABEL: Record<PhotoAngle, string> = {
  front: 'Front',
  rear: 'Rear',
  left: 'Left side',
  right: 'Right side',
  dashboard: 'Dashboard',
  seats: 'Seats',
};

/**
 * The six required photo slots (onboarding spec §5). Each slot uploads via the
 * signed-URL flow and attaches with its angle; filling an occupied slot
 * replaces that photo. A listing cannot be activated until every slot is full.
 */
export function PhotoSlots({
  vehicleId,
  angles,
  onChanged,
}: {
  vehicleId: string;
  angles: Partial<Record<PhotoAngle, string>>;
  onChanged: () => void;
}) {
  const upload = useMutation({
    mutationFn: async ({ angle, file }: { angle: PhotoAngle; file: File }) => {
      const res = await api<{ signedUrl: string; path: string }>(`/vehicles/${vehicleId}/photos`, {
        method: 'POST',
        body: JSON.stringify({ file_name: file.name }),
      });
      const put = await fetch(res.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) throw new Error(`Upload failed: ${put.status}`);
      return api(`/vehicles/${vehicleId}/photos/attach`, {
        method: 'POST',
        body: JSON.stringify({ path: res.path, angle }),
      });
    },
    onSuccess: onChanged,
  });

  const missing = PHOTO_ANGLES.filter((a) => !angles[a]).length;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, color: missing ? 'var(--gold-600)' : 'var(--success)', marginBottom: 6 }}>
        {missing
          ? `Required photos — ${6 - missing}/6 (all six needed to go live)`
          : 'Required photos — 6/6 ✓'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {PHOTO_ANGLES.map((angle) => {
          const url = angles[angle];
          const busy = upload.isPending && upload.variables?.angle === angle;
          return (
            <label
              key={angle}
              title={url ? `Replace the ${ANGLE_LABEL[angle].toLowerCase()} photo` : `Upload the ${ANGLE_LABEL[angle].toLowerCase()} photo`}
              style={{ cursor: 'pointer', textAlign: 'center' }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 84,
                  height: 56,
                  borderRadius: 6,
                  border: url ? '1px solid rgba(0,0,0,0.12)' : '1.5px dashed rgba(0,0,0,0.3)',
                  background: url ? 'transparent' : 'rgba(0,0,0,0.03)',
                  overflow: 'hidden',
                  opacity: busy ? 0.4 : 1,
                }}
              >
                {url ? (
                  <img src={url} alt={ANGLE_LABEL[angle]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 18, color: 'rgba(0,0,0,0.35)' }}>+</span>
                )}
              </span>
              <span style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, marginTop: 3, color: url ? 'inherit' : 'var(--gray-500, #777)' }}>
                {busy ? 'Uploading…' : ANGLE_LABEL[angle]}
              </span>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                disabled={upload.isPending}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload.mutate({ angle, file: f });
                  e.target.value = '';
                }}
              />
            </label>
          );
        })}
      </div>
      {upload.isError && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: '#c0392b', marginTop: 6, marginBottom: 0 }}>
          {(upload.error as Error).message}
        </p>
      )}
    </div>
  );
}

/** Gallery photos that aren't filling a required slot. */
export function extraPhotos(vehicle: Vehicle): string[] {
  const slotUrls = new Set(Object.values(vehicle.photo_angles ?? {}));
  return vehicle.photos.filter((p) => !slotUrls.has(p));
}
