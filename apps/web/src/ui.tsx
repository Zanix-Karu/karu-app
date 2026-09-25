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

/**
 * REQ-3: a country-code picker beside the national number, combined into one
 * E.164 value ("+237612345678") rather than a free-text field. Cameroon
 * (+237) is the default — Karu's home market — with the diaspora's usual
 * destinations (France, Belgium, the UK, North America) alongside the
 * region's other francophone/anglophone markets.
 *
 * A value that predates this picker (free-text, no leading "+") still shows:
 * splitPhone() falls back to treating the whole thing as the national number
 * under the default country rather than dropping it.
 */
const COUNTRY_CODES: readonly { dial: string; label: string }[] = [
  { dial: '+237', label: '🇨🇲 +237 · Cameroon' },
  { dial: '+33', label: '🇫🇷 +33 · France' },
  { dial: '+32', label: '🇧🇪 +32 · Belgium' },
  { dial: '+44', label: '🇬🇧 +44 · United Kingdom' },
  { dial: '+49', label: '🇩🇪 +49 · Germany' },
  { dial: '+1', label: '🇺🇸 +1 · US / Canada' },
  { dial: '+234', label: '🇳🇬 +234 · Nigeria' },
  { dial: '+225', label: "🇨🇮 +225 · Côte d'Ivoire" },
  { dial: '+221', label: '🇸🇳 +221 · Senegal' },
  { dial: '+241', label: '🇬🇦 +241 · Gabon' },
  { dial: '+235', label: '🇹🇩 +235 · Chad' },
  { dial: '+242', label: '🇨🇬 +242 · Congo' },
  { dial: '+243', label: '🇨🇩 +243 · DR Congo' },
  { dial: '+229', label: '🇧🇯 +229 · Benin' },
  { dial: '+228', label: '🇹🇬 +228 · Togo' },
  { dial: '+223', label: '🇲🇱 +223 · Mali' },
  { dial: '+233', label: '🇬🇭 +233 · Ghana' },
  { dial: '+27', label: '🇿🇦 +27 · South Africa' },
  { dial: '+34', label: '🇪🇸 +34 · Spain' },
  { dial: '+39', label: '🇮🇹 +39 · Italy' },
  { dial: '+31', label: '🇳🇱 +31 · Netherlands' },
  { dial: '+41', label: '🇨🇭 +41 · Switzerland' },
];

// Longest dial code first: a future addition sharing a leading digit with a
// shorter code (e.g. +12 vs +1) must match the longer one first.
const DIALS_BY_LENGTH = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length);

function splitPhone(value: string): { dial: string; national: string } {
  const v = value.trim();
  const match = DIALS_BY_LENGTH.find((c) => v.startsWith(c.dial));
  if (match) return { dial: match.dial, national: v.slice(match.dial.length).trim() };
  return { dial: COUNTRY_CODES[0].dial, national: v };
}

export function PhoneInput({
  value,
  onChange,
  placeholder,
}: {
  /** E.164 ("+237612345678"), or a pre-existing free-text number, or ''. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const { dial, national } = splitPhone(value);

  const emit = (nextDial: string, nextNational: string) => {
    const digits = nextNational.replace(/\D/g, '');
    // An empty number is no number at all — don't emit a bare dial code.
    onChange(digits ? `${nextDial}${digits}` : '');
  };

  return (
    <div className="flex gap-2">
      <select
        // inputClass bakes in `w-full`; a `w-[8.5rem]` utility alongside it
        // targets the same `width` property at equal specificity, and which
        // one wins depends on their order in Tailwind's compiled stylesheet,
        // not on their order in this class list. An inline style avoids that
        // race and reliably keeps this select narrow.
        className={`${inputClass} shrink-0`}
        style={{ width: '8.5rem' }}
        value={dial}
        aria-label={t('common.countryCode')}
        onChange={(e) => emit(e.target.value, national)}
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.dial} value={c.dial}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        type="tel"
        // min-w-0 + flex-1: without them, `inputClass`'s own `w-full` only
        // sets this input's flex-basis, so the fixed-width select next to it
        // squeezes the input down to its min-content width instead of the
        // remaining space.
        className={`${inputClass} min-w-0 flex-1`}
        value={national}
        placeholder={placeholder}
        onChange={(e) => emit(dial, e.target.value)}
      />
    </div>
  );
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
