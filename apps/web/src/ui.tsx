import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import type { BookingStatus } from '@karu/shared';

/** Karu UI primitives — visual language of the approved mockups. */

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'danger' | 'ghost';
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
      className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${variants[variant]} ${className}`}
      {...rest}
    />
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
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[status]}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

/** Listing image with a branded placeholder while photos are pending. */
export function CarImage({
  photos,
  alt,
  className = '',
}: {
  photos: string[];
  alt: string;
  className?: string;
}) {
  if (photos.length > 0) {
    return <img src={photos[0]} alt={alt} className={`object-cover ${className}`} />;
  }
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-karu-brown to-karu-ink ${className}`}
    >
      <span className="font-display text-2xl font-bold tracking-widest text-karu-yellow/80">
        KARU
      </span>
    </div>
  );
}
