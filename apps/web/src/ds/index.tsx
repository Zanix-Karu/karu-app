/**
 * Karu design system, restyled on NourishwithB's components
 * (src/components/ui in that repo): pill buttons with an arrow on the
 * primary, rounded-2xl cards with a hairline border, stone neutrals, status
 * badges with a leading dot, 44px touch targets and brand focus rings.
 *
 * The props are the ones the screens already use, so callers didn't change;
 * dark-panel tones from the old mockups now render as quiet light surfaces,
 * since the Nourish look has no dark panels.
 */
import { motion } from 'motion/react';
import { ArrowRight, Check, Star } from 'lucide-react';
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { useId } from 'react';
import { cn } from '../lib/cn';
import { EASE_SMOOTH_OUT } from '../lib/motion';

// --- Brand -------------------------------------------------------------------

export function Wordmark({
  color = 'var(--color-slate-900)',
  size = 28,
  style = {},
}: {
  color?: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      className="font-display font-extrabold"
      style={{ fontSize: size, letterSpacing: '0.18em', color, ...style }}
    >
      KARU
    </span>
  );
}

// --- Button ------------------------------------------------------------------

type ButtonVariant = 'primary' | 'gold' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text focus-visible:ring-offset-2 focus-visible:ring-offset-page';

export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand shadow-sm hover:bg-brand-dark',
  gold: 'bg-brand text-on-brand shadow-sm hover:bg-brand-dark',
  secondary: 'border border-slate-300 bg-surface text-slate-700 hover:border-slate-400 hover:bg-slate-50',
  outline: 'border border-slate-300 bg-surface text-slate-700 hover:border-slate-400 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'border border-danger/30 bg-surface text-danger hover:border-danger/50 hover:bg-danger-tint',
};

export const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-4 py-2 text-sm',
  md: 'min-h-11 px-6 py-3 text-sm',
  lg: 'min-h-12 px-8 py-3.5 text-base',
};

/** Shared by both Button components and link-styled buttons. */
export const buttonClass = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', full = false) =>
  cn(
    'karu-btn inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-150',
    'disabled:cursor-not-allowed disabled:opacity-60',
    FOCUS,
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    full && 'w-full',
  );

export function Button({
  variant = 'primary',
  size = 'md',
  shape: _shape,
  full = false,
  loading = false,
  arrow,
  style,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Kept for old callers; every button is a pill now. */
  shape?: 'rounded' | 'pill';
  full?: boolean;
  /** Shows a spinner and blocks clicks, keeping the label in place. */
  loading?: boolean;
  /** The trailing arrow Nourish puts on primary buttons. On by default for primary. */
  arrow?: boolean;
}) {
  const showArrow = (arrow ?? variant === 'primary') && !loading;
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClass(variant, size, full), className)}
      style={style}
      {...rest}
    >
      {loading && <Spinner className="label-in" />}
      {children}
      {showArrow && <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />}
    </button>
  );
}

/** The app's single loading indicator: a ring in the current text colour. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'karu-btn-spinner inline-block h-4 w-4 shrink-0 rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  );
}

// --- Surfaces ----------------------------------------------------------------

export function Card({
  children,
  tone = 'light',
  pad,
  radius,
  className = '',
  style = {},
}: {
  children: ReactNode;
  tone?: 'light' | 'panel' | 'canvas';
  pad?: number | string;
  radius?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl',
        pad == null && 'p-6',
        tone === 'light' && 'border border-slate-200 bg-surface text-slate-700 shadow-sm',
        tone === 'panel' && 'border border-slate-200 bg-slate-50 text-slate-700',
        tone === 'canvas' && 'bg-slate-50 text-slate-700',
        className,
      )}
      style={{ ...(pad != null ? { padding: pad } : {}), ...(radius ? { borderRadius: radius } : {}), ...style }}
    >
      {children}
    </div>
  );
}

// --- Data display ------------------------------------------------------------

type BadgeVariant = 'upcoming' | 'success' | 'neutral' | 'solid' | 'danger' | 'warning';

const BADGE: Record<BadgeVariant, [string, string]> = {
  upcoming: ['bg-brand-tint text-slate-900', 'bg-brand'],
  success: ['bg-success-tint text-slate-800', 'bg-success'],
  warning: ['bg-warn-tint text-warn', 'bg-warn'],
  neutral: ['bg-slate-100 text-slate-600', 'bg-slate-400'],
  solid: ['bg-brand text-on-brand', 'bg-on-brand'],
  danger: ['bg-danger-tint text-danger', 'bg-danger'],
};

/** Status pill with a leading dot, as in Nourish. */
export function Badge({
  children,
  variant = 'upcoming',
  dot = true,
  className = '',
  style = {},
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [box, dotColour] = BADGE[variant];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
        box,
        className,
      )}
      style={style}
    >
      {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotColour)} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** A soft chip: Nourish's `rounded-full bg-slate-100` label. */
export function Tag({
  children,
  tone: _tone,
  className = '',
  style = {},
}: {
  children: ReactNode;
  tone?: 'dark' | 'light';
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700',
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}

export function FeatureChip({
  icon,
  children,
  tone: _tone,
  className = '',
  style = {},
}: {
  icon?: ReactNode;
  children: ReactNode;
  tone?: 'light' | 'dark';
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700',
        className,
      )}
      style={style}
    >
      {icon && <span className="flex text-brand-text">{icon}</span>}
      {children}
    </span>
  );
}

export function Rating({
  value,
  count,
  size = 16,
  color,
  style = {},
}: {
  value: number | string;
  count?: number;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span className="inline-flex items-center gap-1.5" style={style}>
      <Star aria-hidden="true" className="fill-brand text-brand" style={{ width: size, height: size }} />
      <span className="font-semibold text-slate-900" style={{ fontSize: size * 0.875, ...(color ? { color } : {}) }}>
        {value}
        {count != null && <span className="font-medium text-slate-500"> ({count})</span>}
      </span>
    </span>
  );
}

// --- Forms -------------------------------------------------------------------

export function Field({
  label,
  children,
  onDark: _onDark,
  className = '',
  style = {},
}: {
  label: string;
  children: ReactNode;
  onDark?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <label className={cn('block', className)} style={style}>
      <span className="mb-1.5 block text-sm font-semibold text-slate-900">{label}</span>
      {children}
    </label>
  );
}

export const inputClass = cn(
  'flex min-h-11 w-full rounded-md border border-slate-300 bg-surface px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 transition-colors',
  'focus-visible:border-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20',
);

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, className)} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputClass, className)} />;
}

// --- Navigation --------------------------------------------------------------

/**
 * Tabs with one shared underline that glides to the chosen tab, as in
 * Nourish's portal tab bar. `layoutId` is per instance so two tab bars on
 * one page don't steal each other's underline.
 */
export function Tabs({
  items,
  active,
  onChange,
  className = '',
  style = {},
}: {
  items: Array<{ key: string; label: string }>;
  active: string;
  onChange: (key: string) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const id = useId();
  return (
    <div role="tablist" className={cn('-mb-px flex gap-1 overflow-x-auto border-b border-slate-200', className)} style={style}>
      {items.map((t) => {
        const is = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={is}
            onClick={() => onChange(t.key)}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-semibold transition-colors duration-150',
              FOCUS,
              is ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900',
            )}
          >
            {t.label}
            {is && (
              <motion.span
                layoutId={`tabs-underline-${id}`}
                transition={{ duration: 0.25, ease: EASE_SMOOTH_OUT }}
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function StepNav({
  steps,
  current,
  className = '',
  style = {},
}: {
  steps: string[];
  current: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <ol className={cn('flex flex-wrap items-center gap-3', className)} style={style}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="inline-flex items-center gap-3" aria-current={active ? 'step' : undefined}>
            <span className="inline-flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors duration-250',
                  active || done ? 'bg-brand text-on-brand' : 'bg-slate-100 text-slate-500',
                )}
              >
                {done ? <Check aria-hidden="true" className="badge-pop h-4 w-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn('text-sm font-semibold', active ? 'text-slate-900' : 'text-slate-500')}>{label}</span>
            </span>
            {i < steps.length - 1 && <span className="h-px w-8 bg-slate-200" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Section nav, as in Nourish's admin sidebar: the active item sits on a
 * brand tint that glides between items.
 */
export function SidebarNav({
  items,
  active,
  onSelect,
  className = '',
  style = {},
}: {
  items: Array<{ key: string; label: string; icon?: ReactNode; hint?: string }>;
  active: string;
  onSelect: (key: string) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const id = useId();
  return (
    <nav className={cn('flex flex-col gap-0.5', className)} style={style}>
      {items.map((it) => {
        const is = it.key === active;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onSelect(it.key)}
            aria-current={is ? 'page' : undefined}
            className={cn(
              'group relative isolate flex items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150',
              FOCUS,
              is ? '' : 'hover:bg-slate-100',
            )}
          >
            {is && (
              <motion.span
                layoutId={`sidebar-active-${id}`}
                transition={{ duration: 0.25, ease: EASE_SMOOTH_OUT }}
                className="absolute inset-0 -z-10 rounded-lg bg-brand-tint"
                aria-hidden="true"
              />
            )}
            {it.icon && (
              <span className={cn('mt-0.5 flex shrink-0', is ? 'text-brand-text' : 'text-slate-400 group-hover:text-slate-600')}>
                {it.icon}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className={cn('block text-sm font-semibold', is ? 'text-slate-900' : 'text-slate-800')}>{it.label}</span>
              {it.hint && <span className="block truncate text-xs text-slate-500">{it.hint}</span>}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = false,
  icon,
  className = '',
  style = {},
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
  icon?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Card className={className} style={style}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-500">{label}</span>
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-text">
            {icon}
          </span>
        )}
      </div>
      <div className={cn('value-pop mt-2 whitespace-nowrap font-display text-xl font-bold leading-tight tracking-tight tabular-nums lg:text-[1.375rem]', accent ? 'text-brand-text' : 'text-slate-900')}>
        {value}
      </div>
      {hint && <div className="mt-1 text-sm text-slate-500">{hint}</div>}
    </Card>
  );
}

// --- Marketplace -------------------------------------------------------------

export function CarCard({
  image,
  name,
  category,
  seats,
  transmission,
  extra,
  provider,
  rating,
  reviews,
  price,
  currency = 'FCFA',
  subPrice,
  secondaryPrice,
  perDayLabel = 'per day',
  viewLabel = 'View details',
  onView,
  headingLevel = 'h3',
  className = '',
  style = {},
}: {
  image?: string;
  name: string;
  category: string;
  seats: string;
  transmission: string;
  extra?: string;
  provider?: string;
  rating?: number | string;
  reviews?: number;
  price: number;
  currency?: string;
  subPrice?: string;
  /** Converted price shown beside XAF, e.g. "€38". */
  secondaryPrice?: string | null;
  /** Passed in so the design system stays free of i18n wiring. */
  perDayLabel?: string;
  viewLabel?: string;
  onView?: () => void;
  /** Heading tag for the car name so a results list is navigable by
   *  structure (A11Y-3). Defaults to h3; the search results pass h2. */
  headingLevel?: 'h2' | 'h3';
  className?: string;
  style?: CSSProperties;
}) {
  const NameTag = headingLevel;
  return (
    <div
      className={cn(
        'karu-car-card group relative rounded-2xl border border-slate-200 bg-surface p-4 shadow-sm transition-[transform,box-shadow] duration-250 ease-[var(--ease-smooth-out)] hover:-translate-y-[3px] hover:shadow-lg sm:p-5',
        className,
      )}
      style={style}
    >
      {/* DS-6: a fixed box plus `cover` crops every photo to the same shape,
          so portrait and landscape sources line up in the grid. */}
      <div className="h-40 w-full overflow-hidden rounded-xl bg-slate-100">
        {image ? (
          <img
            src={image}
            alt={name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover object-center transition-transform duration-500 ease-[var(--ease-smooth-out)] group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-brand-tint">
            <Wordmark size={20} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <NameTag className="m-0 font-display text-xl font-bold tracking-tight text-slate-900">{name}</NameTag>
          <div className="mt-0.5 text-sm font-medium text-slate-500">{category}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <FeatureChip>{seats}</FeatureChip>
          <FeatureChip>{transmission}</FeatureChip>
          {extra && <FeatureChip>{extra}</FeatureChip>}
        </div>
      </div>

      <div className="karu-car-card-actions">
        {provider && <span className="text-sm font-semibold text-slate-900">{provider}</span>}
        {rating != null && <Rating value={rating} count={reviews} size={16} />}
        <div className="mt-1 text-right">
          <span className="font-display text-2xl font-bold tracking-tight text-slate-900">
            {currency} {price.toLocaleString('en-US')}
          </span>
          {secondaryPrice && <div className="text-sm font-semibold text-brand-text">{secondaryPrice}</div>}
          {subPrice && <div className="text-xs font-semibold text-slate-500">{subPrice}</div>}
          <div className="mt-0.5 text-xs font-semibold text-slate-500">{perDayLabel}</div>
        </div>
        <Button variant="primary" size="sm" onClick={onView} className="mt-1">
          {viewLabel}
        </Button>
      </div>
    </div>
  );
}

// --- Segmented control ---------------------------------------------------------

/** Container + button classes for a small set of mutually exclusive views
 *  (sign in / create account, active / archived). The chosen one sits on a
 *  white pill that glides between options. */
export const segmentWrap = 'inline-flex rounded-full border border-slate-200 bg-slate-100 p-1';
export const segmentButton = (active: boolean) =>
  cn(
    'relative isolate inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-150',
    FOCUS,
    active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900',
  );

/** Put inside the active segment; `group` must be unique per control. */
export function SegmentPill({ group }: { group: string }) {
  return (
    <motion.span
      layoutId={`segment-${group}`}
      transition={{ duration: 0.25, ease: EASE_SMOOTH_OUT }}
      className="absolute inset-0 -z-10 rounded-full bg-surface shadow-sm"
      aria-hidden="true"
    />
  );
}
