import { useTranslation } from 'react-i18next';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import type { BookingStatus } from '@karu/shared';

/** Karu UI primitives — visual language of the approved mockups. */

/**
 * NOTE: there are two Button components in this app, this one and the DS one
 * in ds/index.tsx, with different variant sets, and screens import from both.
 * They should converge. Until they do, both carry the same states so a
 * keyboard user gets the same focus ring either way.
 */
export function Button({
  variant = 'primary',
  className = '',
  loading = false,
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'danger' | 'ghost';
  /** Shows a spinner and blocks clicks, keeping the label in place. */
  loading?: boolean;
}) {
  const variants = {
    primary:
      'bg-karu-yellow text-karu-ink hover:brightness-95 disabled:opacity-40 disabled:hover:brightness-100',
    outline:
      'border-[1.5px] border-karu-ink text-karu-ink hover:bg-karu-ink hover:text-karu-cream disabled:opacity-40',
    danger: 'bg-karu-terracotta text-white hover:brightness-95 disabled:opacity-40',
    ghost: 'text-karu-brown hover:bg-karu-ink/5 disabled:opacity-40',
  } as const;
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`karu-btn inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="karu-btn-spinner inline-block h-[1em] w-[1em] shrink-0 rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-karu-ink/10 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-karu-mute">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-karu-ink/15 bg-white px-3 py-2.5 text-sm text-karu-ink placeholder:text-karu-mute/70 focus:border-karu-gold focus:outline-none focus:ring-2 focus:ring-karu-yellow/40';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputClass} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={inputClass} {...props} />;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-karu-mute">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-karu-gold border-t-transparent" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-karu-terracotta/30 bg-karu-terracotta/10 px-4 py-3 text-sm text-karu-terracotta">
      {children}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-16 text-center">
      <p className="font-display text-xl text-karu-brown">{title}</p>
      {hint && <p className="mt-1 text-sm text-karu-mute">{hint}</p>}
    </div>
  );
}

const STATUS_STYLE: Record<BookingStatus, string> = {
  requested: 'bg-karu-amber/20 text-karu-brown',
  confirmed: 'bg-green-100 text-green-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-karu-ink/10 text-karu-ink',
  rejected: 'bg-karu-terracotta/15 text-karu-terracotta',
  cancelled: 'bg-karu-ink/5 text-karu-mute',
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}
    >
      {t(`status.${status}`)}
    </span>
  );
}

/**
 * Listing image with a branded placeholder while photos are pending.
 *
 * DS-6: source photos vary in shape — most are 1200x800 landscape but some are
 * portrait — and without a fixed ratio the rendered images differed in height,
 * so cards sat unevenly in the grid. The ratio box plus object-cover crops
 * instead of stretching, so any source fills the same shape.
 *
 * PERF-1: `loading="lazy"` and `decoding="async"` keep off-screen photos off
 * the critical path. Images come full-size from an external CDN, which is slow
 * on the connections much of this market uses; sizing them properly needs a
 * resizing proxy and is still open.
 */
export function CarImage({
  photos,
  alt,
  className = '',
  ratio = '16 / 10',
  eager = false,
}: {
  photos: string[];
  alt: string;
  className?: string;
  /** Card grids share 16/10; the detail hero passes 4/3. */
  ratio?: string;
  /** Set on the one above-the-fold image so it is not deferred. */
  eager?: boolean;
}) {
  const box = `overflow-hidden bg-karu-brown/10 ${className}`;

  if (photos.length > 0) {
    return (
      <div className={box} style={{ aspectRatio: ratio }}>
        <img
          src={photos[0]}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="h-full w-full object-cover object-center"
        />
      </div>
    );
  }
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-karu-brown to-karu-ink ${box}`}
      style={{ aspectRatio: ratio }}
    >
      <span className="font-display text-2xl font-bold tracking-widest text-karu-yellow/80">
        KARU
      </span>
    </div>
  );
}
