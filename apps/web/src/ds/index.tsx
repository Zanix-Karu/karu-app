/**
 * Karu design system — faithful TSX port of the approved mockups'
 * KaruDesignSystem components (inline styles + CSS custom properties from
 * tokens.css). Visuals are kept 1:1 with the mockups; only React idioms and
 * typing were modernised.
 */
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
} from 'react';

// --- Brand -------------------------------------------------------------------

export function Wordmark({
  color = 'var(--gold-400)',
  size = 28,
  style = {},
}: {
  color?: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: size,
        letterSpacing: '0.3em',
        color,
        ...style,
      }}
    >
      KARU
    </span>
  );
}

// --- Button --------------------------------------------------------------------

type ButtonVariant = 'primary' | 'gold' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_SIZES: Record<ButtonSize, CSSProperties> = {
  sm: { padding: '8px 16px', fontSize: 15, height: 40 },
  md: { padding: '12px 24px', fontSize: 18, height: 52 },
  lg: { padding: '16px 32px', fontSize: 20, height: 64 },
};

const BUTTON_VARIANTS: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'var(--yellow)', color: 'var(--brand-ink)', border: 'none' },
  gold: { background: 'var(--gold-600)', color: 'var(--white)', border: 'none' },
  secondary: { background: 'var(--white)', color: 'var(--ink)', border: 'none' },
  outline: { background: 'transparent', color: 'var(--ink)', border: '1.5px solid var(--ink)' },
  ghost: {
    background: 'rgba(255,255,255,0.12)',
    color: 'var(--white)',
    border: '1px solid rgba(255,255,255,0.4)',
  },
  danger: { background: 'var(--danger)', color: 'var(--white)', border: 'none' },
};

export function Button({
  variant = 'primary',
  size = 'md',
  shape = 'rounded',
  full = false,
  style = {},
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: 'rounded' | 'pill';
  full?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        width: full ? '100%' : undefined,
        borderRadius: shape === 'pill' ? 'var(--radius-pill)' : 'var(--radius-md)',
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'filter 150ms ease, transform 150ms ease',
        ...BUTTON_SIZES[size],
        ...BUTTON_VARIANTS[variant],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.filter = 'brightness(0.95)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = '';
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// --- Surfaces ------------------------------------------------------------------

export function Card({
  children,
  tone = 'light',
  pad = 24,
  radius = 'var(--radius-md)',
  style = {},
}: {
  children: ReactNode;
  tone?: 'light' | 'panel' | 'canvas';
  pad?: number | string;
  radius?: string;
  style?: CSSProperties;
}) {
  const tones: Record<string, CSSProperties> = {
    light: { background: 'var(--white)', color: 'var(--ink)', boxShadow: 'var(--shadow-card)' },
    panel: {
      background: 'rgba(255,255,255,0.06)',
      color: 'var(--white)',
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14)',
    },
    canvas: { background: 'var(--cream-200)', color: 'var(--ink)', boxShadow: 'none' },
  };
  return (
    <div style={{ borderRadius: radius, padding: pad, boxSizing: 'border-box', ...tones[tone], ...style }}>
      {children}
    </div>
  );
}

// --- Data display ---------------------------------------------------------------

export function Badge({
  children,
  variant = 'upcoming',
  style = {},
}: {
  children: ReactNode;
  variant?: 'upcoming' | 'success' | 'neutral' | 'solid' | 'danger';
  style?: CSSProperties;
}) {
  const variants: Record<string, CSSProperties> = {
    upcoming: { background: 'rgba(251,211,1,0.22)', color: 'var(--gold-600)' },
    success: { background: 'rgba(46,158,63,0.14)', color: 'var(--success)' },
    neutral: { background: 'var(--cream-200)', color: 'var(--gray-500)' },
    solid: { background: 'var(--yellow)', color: 'var(--ink)' },
    danger: { background: 'rgba(246,6,6,0.12)', color: 'var(--danger)' },
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '5px 12px',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        fontSize: 13,
        lineHeight: 1,
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Tag({
  children,
  tone = 'dark',
  style = {},
}: {
  children: ReactNode;
  tone?: 'dark' | 'light';
  style?: CSSProperties;
}) {
  const dark = tone === 'dark';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '10px 20px',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        fontSize: 18,
        lineHeight: 1,
        background: dark ? 'rgba(255,255,255,0.16)' : 'var(--cream-200)',
        color: dark ? 'var(--white)' : 'var(--ink)',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function FeatureChip({
  icon,
  children,
  tone = 'light',
  style = {},
}: {
  icon?: ReactNode;
  children: ReactNode;
  tone?: 'light' | 'dark';
  style?: CSSProperties;
}) {
  const dark = tone === 'dark';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 18px',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        fontSize: 16,
        background: dark ? 'transparent' : 'var(--white)',
        color: dark ? 'var(--white)' : 'var(--ink)',
        boxShadow: dark ? 'none' : 'inset 0 0 0 1px var(--border-light)',
        ...style,
      }}
    >
      {icon && <span style={{ display: 'flex' }}>{icon}</span>}
      {children}
    </span>
  );
}

const STAR = (
  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
);

export function Rating({
  value,
  count,
  size = 16,
  color = 'var(--ink)',
  style = {},
}: {
  value: number | string;
  count?: number;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...style }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--rating)" stroke="var(--rating)" strokeWidth="1" strokeLinejoin="round">
        {STAR}
      </svg>
      <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: size * 0.9, color }}>
        {value}
        {count != null && <span style={{ fontWeight: 500 }}> ({count})</span>}
      </span>
    </span>
  );
}

// --- Forms -----------------------------------------------------------------------

export function Field({
  label,
  children,
  onDark = false,
  style = {},
}: {
  label: string;
  children: ReactNode;
  onDark?: boolean;
  style?: CSSProperties;
}) {
  return (
    <label style={{ display: 'block', ...style }}>
      <span
        style={{
          display: 'block',
          marginBottom: 6,
          fontFamily: 'var(--font-ui)',
          fontWeight: 600,
          fontSize: 14,
          color: onDark ? 'var(--text-on-dark-muted)' : 'var(--gray-500)',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '13px 16px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-light)',
  background: 'var(--white)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-ui)',
  fontWeight: 500,
  fontSize: 16,
  outline: 'none',
};

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...props.style }} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...inputStyle, ...props.style }} />;
}

// --- Navigation --------------------------------------------------------------------

export function Tabs({
  items,
  active,
  onChange,
  style = {},
}: {
  items: Array<{ key: string; label: string }>;
  active: string;
  onChange: (key: string) => void;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, ...style }}>
      {items.map((t) => {
        const is = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              padding: '10px 22px',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              fontSize: 15,
              background: is ? 'var(--ink)' : 'transparent',
              color: is ? 'var(--white)' : 'var(--gray-500)',
              transition: 'all 150ms ease',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function StepNav({
  steps,
  current,
  style = {},
}: {
  steps: string[];
  current: number;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...style }}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 700,
                  fontSize: 14,
                  background: active || done ? 'var(--yellow)' : 'var(--cream-200)',
                  color: active || done ? 'var(--ink)' : 'var(--gray-400)',
                }}
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 600,
                  fontSize: 14,
                  color: active ? 'var(--ink)' : 'var(--gray-400)',
                }}
              >
                {label}
              </span>
            </span>
            {i < steps.length - 1 && (
              <span style={{ width: 34, height: 1, background: 'var(--border-light)' }} />
            )}
          </span>
        );
      })}
    </div>
  );
}

export function SidebarNav({
  items,
  active,
  onSelect,
  style = {},
}: {
  items: Array<{ key: string; label: string }>;
  active: string;
  onSelect: (key: string) => void;
  style?: CSSProperties;
}) {
  return (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {items.map((it) => {
        const is = it.key === active;
        return (
          <button
            key={it.key}
            onClick={() => onSelect(it.key)}
            style={{
              textAlign: 'left',
              padding: '12px 18px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              fontSize: 15,
              background: is ? 'var(--yellow)' : 'transparent',
              color: is ? 'var(--ink)' : 'var(--text-on-dark-muted)',
              transition: 'all 150ms ease',
            }}
          >
            {it.label}
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
  style = {},
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
  style?: CSSProperties;
}) {
  return (
    <Card style={style}>
      <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--gray-500)' }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 8,
          fontFamily: 'var(--font-sans)',
          fontWeight: 800,
          fontSize: 34,
          color: accent ? 'var(--gold-600)' : 'var(--ink)',
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ marginTop: 6, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-400)' }}>
          {hint}
        </div>
      )}
    </Card>
  );
}

// --- Marketplace ---------------------------------------------------------------------

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
  perDayLabel = 'per day',
  onView,
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
  /** Passed in so the design system stays free of i18n wiring. */
  perDayLabel?: string;
  onView?: () => void;
  style?: CSSProperties;
}) {
  return (
    <div
      className="karu-car-card"
      style={{
        background: 'var(--white)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        padding: 24,
        position: 'relative',
        ...style,
      }}
    >
      {image ? (
        <img src={image} alt={name} style={{ width: '100%', height: 150, objectFit: 'contain' }} />
      ) : (
        <div
          style={{
            height: 150,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-gradient)',
          }}
        >
          <Wordmark size={22} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 30, color: 'var(--ink)' }}>
            {name}
          </span>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 16, color: 'var(--gray-500)', marginTop: 2 }}>
            {category}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <FeatureChip>{seats}</FeatureChip>
          <FeatureChip>{transmission}</FeatureChip>
          {extra && <FeatureChip>{extra}</FeatureChip>}
        </div>
      </div>

      <div className="karu-car-card-actions">
        {provider && (
          <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
            {provider}
          </span>
        )}
        {rating != null && <Rating value={rating} count={reviews} size={16} />}
        <div style={{ textAlign: 'right', marginTop: 4 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 26, color: 'var(--ink)' }}>
            {currency} {price.toLocaleString('en-US')}
          </span>
          {subPrice && (
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'var(--gray-400)' }}>
              {subPrice}
            </div>
          )}
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>
            {perDayLabel}
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={onView} style={{ marginTop: 4 }}>
          View details
        </Button>
      </div>
    </div>
  );
}
