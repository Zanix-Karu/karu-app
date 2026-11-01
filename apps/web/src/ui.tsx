import { CircleAlert, CircleCheck, Inbox, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import type { BookingStatus } from '@karu/shared';
import { Badge, Button as DsButton, inputClass } from './ds';
import { cn } from './lib/cn';

/**
 * Karu UI primitives, in NourishwithB's style. These and ds/index.tsx used
 * to be two different looks; both now share the same classes (Nourish's
 * pill buttons, rounded-2xl cards, stone inputs), so it no longer matters
 * which one a screen imports.
 */

const VARIANT_MAP = { primary: 'primary', outline: 'outline', danger: 'danger', ghost: 'ghost' } as const;

export function Button({
  variant = 'primary',
  className = '',
  loading = false,
  arrow,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'danger' | 'ghost';
  /** Shows a spinner and blocks clicks, keeping the label in place. */
  loading?: boolean;
  /** Trailing arrow on primary buttons (Nourish). On by default for primary. */
  arrow?: boolean;
}) {
  return (
    <DsButton variant={VARIANT_MAP[variant]} size="sm" loading={loading} arrow={arrow} className={className} {...rest} />
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-surface p-6 shadow-sm', className)}>{children}</div>
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
    <label className={cn('block', className)}>
      <span className="mb-2 block text-sm font-semibold text-slate-900">{label}</span>
      {children}
    </label>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputClass, className)} {...props} />;
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
      {/* The list shows "flag +code · country"; the closed picker shows just
          "flag +code" (drawn over the select) so it never truncates. */}
      <div className="relative shrink-0" style={{ width: '7.25rem' }}>
        <select
          className={cn(inputClass, 'pr-7 text-transparent')}
          value={dial}
          aria-label={t('common.countryCode')}
          onChange={(e) => emit(e.target.value, national)}
        >
          {COUNTRY_CODES.map((c) => (
            <option key={c.dial} value={c.dial} className="text-slate-900">
              {c.label}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-base text-slate-900">
          {COUNTRY_CODES.find((c) => c.dial === dial)?.label.split(' · ')[0]}
        </span>
      </div>
      <input
        type="tel"
        // min-w-0 + flex-1: without them, `inputClass`'s own `w-full` only
        // sets this input's flex-basis, so the fixed-width select next to it
        // squeezes the input down to its min-content width instead of the
        // remaining space.
        className={cn(inputClass, 'min-w-0 flex-1')}
        value={national}
        placeholder={placeholder}
        onChange={(e) => emit(dial, e.target.value)}
      />
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div aria-busy="true" className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <span className="karu-btn-spinner h-5 w-5 rounded-full border-2 border-brand border-t-transparent" />
      <span className="shimmer-text text-sm font-medium">{label}</span>
    </div>
  );
}

/** Error message box. The icon shakes once as it appears (ds/icon-motion.css). */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="error-summary flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger-tint px-4 py-3 text-sm text-danger"
    >
      <CircleAlert aria-hidden="true" className="mt-px h-[1.15em] w-[1.15em] shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Inline "it worked" line next to the action that did it. The tick draws in. */
export function SuccessNote({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      role="status"
      className={cn('label-in inline-flex items-center gap-1.5 text-sm font-semibold text-success', className)}
    >
      <CircleCheck aria-hidden="true" className="h-[1.1em] w-[1.1em] shrink-0" />
      {children}
    </span>
  );
}

/**
 * "Nothing here" panel for lists and sections, as in NourishwithB: a card
 * with an icon in a soft circle, a title, an optional hint and next step.
 */
export function EmptyState({
  title,
  hint,
  Icon = Inbox,
  action,
  className = '',
}: {
  title: string;
  hint?: string;
  Icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('karu-rise-in rounded-2xl border border-slate-200 bg-surface p-8 text-center shadow-sm', className)}>
      <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
        <Icon aria-hidden="true" className="h-5 w-5 text-slate-600" />
      </span>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

const STATUS_VARIANT = {
  requested: 'warning',
  confirmed: 'success',
  in_progress: 'upcoming',
  completed: 'neutral',
  rejected: 'danger',
  cancelled: 'neutral',
} as const satisfies Record<BookingStatus, string>;

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { t } = useTranslation();
  return <Badge variant={STATUS_VARIANT[status]}>{t(`status.${status}`)}</Badge>;
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
  const box = `overflow-hidden bg-slate-100 ${className}`;

  if (photos.length > 0) {
    return (
      <div className={box} style={{ aspectRatio: ratio }}>
        <img
          src={photos[0]}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="h-full w-full object-cover object-center transition-transform duration-500 ease-[var(--ease-smooth-out)] group-hover:scale-[1.03]"
        />
      </div>
    );
  }
  return (
    <div
      className={`flex items-center justify-center bg-brand-tint ${box}`}
      style={{ aspectRatio: ratio }}
    >
      <span className="font-display text-2xl font-extrabold tracking-[0.18em] text-slate-900/70">
        KARU
      </span>
    </div>
  );
}
