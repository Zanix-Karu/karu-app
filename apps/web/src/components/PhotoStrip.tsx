import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { Vehicle } from '@karu/shared';
import { api } from '../lib/api';

/**
 * A listing's photos as thumbnails, each with a two-tap remove control.
 * Removal goes through DELETE /vehicles/:id/photos — the only sanctioned way
 * to take a photo off a listing (PATCH deliberately rejects `photos`).
 */
export function PhotoStrip({
  vehicleId,
  photos,
  onChanged,
}: {
  vehicleId: string;
  photos: string[];
  onChanged: () => void;
}) {
  // Two-tap confirm, same idea as ConfirmButton: first tap arms one photo,
  // second tap on the same photo removes it.
  const [armedUrl, setArmedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!armedUrl) return;
    const t = setTimeout(() => setArmedUrl(null), 4000);
    return () => clearTimeout(t);
  }, [armedUrl]);

  const remove = useMutation({
    mutationFn: (url: string) =>
      api<Vehicle>(`/vehicles/${vehicleId}/photos`, {
        method: 'DELETE',
        body: JSON.stringify({ url }),
      }),
    onSuccess: onChanged,
  });

  if (photos.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      {photos.map((url) => {
        const armed = armedUrl === url;
        return (
          <div key={url} style={{ position: 'relative' }}>
            <img
              src={url}
              alt=""
              style={{
                width: 72,
                height: 48,
                objectFit: 'cover',
                borderRadius: 6,
                border: '1px solid rgba(0,0,0,0.12)',
                opacity: remove.isPending && remove.variables === url ? 0.4 : 1,
              }}
            />
            <button
              type="button"
              aria-label={armed ? 'Confirm remove photo' : 'Remove photo'}
              title={armed ? 'Tap again to remove' : 'Remove photo'}
              disabled={remove.isPending}
              onClick={() => {
                if (armed) {
                  setArmedUrl(null);
                  remove.mutate(url);
                } else {
                  setArmedUrl(url);
                }
              }}
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                width: 20,
                height: 20,
                lineHeight: '18px',
                textAlign: 'center',
                padding: 0,
                borderRadius: '50%',
                border: '1px solid rgba(0,0,0,0.2)',
                background: armed ? '#c0392b' : '#fff',
                color: armed ? '#fff' : '#444',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      {remove.isError && (
        <span style={{ fontSize: 12, color: '#c0392b', alignSelf: 'center' }}>
          {(remove.error as Error).message}
        </span>
      )}
    </div>
  );
}
