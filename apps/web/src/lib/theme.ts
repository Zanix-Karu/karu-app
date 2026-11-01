import { MONKEYTYPE_PALETTES, type MonkeytypePalette } from './monkeytype-palettes';

/**
 * Colour themes.
 *
 * The look follows NourishwithB: white cards on warm neutrals, one brand
 * colour, Plus Jakarta Sans. What changes per theme is only the colours, and
 * every theme is the same six inputs Monkeytype uses
 * ([bg, main, sub, subAlt, text, error]). `themeVars` turns those six into
 * the full token set the app styles against (brand, surfaces, a neutral
 * ramp, status colours), checking contrast as it goes so a palette that was
 * designed for a typing test still gives readable buttons and text here.
 *
 * Who chooses what:
 *  - an admin picks the palettes for everyone: one for light, one for dark
 *    (stored in site_settings, read from GET /settings/appearance);
 *  - each visitor only picks light, dark or "match my device" (this device).
 */

export type Mode = 'system' | 'light' | 'dark';
export interface Appearance {
  light: string;
  dark: string;
}

export interface ThemeEntry {
  id: string;
  /** Display name: "Karu", "Serika dark". */
  name: string;
  source: 'karu' | 'monkeytype';
  palette: MonkeytypePalette;
  /** Exact values for Karu's own themes, where the derived ones aren't quite right. */
  overrides?: Partial<Record<TokenName, string>>;
}

export const DEFAULT_APPEARANCE: Appearance = { light: 'karu', dark: 'karu_night' };

// Nourish's warm stone ramp, used verbatim for Karu's light theme.
const STONE = {
  '50': '#fafaf9', '100': '#f5f5f4', '200': '#e7e5e4', '300': '#d6d3d1', '400': '#a8a29e',
  '500': '#78716c', '600': '#57534e', '700': '#44403c', '800': '#292524', '900': '#1c1917', '950': '#0c0a09',
} as const;

const KARU_THEMES: ThemeEntry[] = [
  {
    id: 'karu',
    name: 'Karu',
    source: 'karu',
    palette: ['#ffffff', '#fbd301', '#78716c', '#f5f5f4', '#1c1917', '#b91c1c'],
    overrides: {
      surface: '#ffffff',
      ...Object.fromEntries(Object.entries(STONE).map(([k, v]) => [`slate-${k}`, v])),
      'brand-dark': '#e6c200',
      'brand-tint': '#fef9d7',
      'brand-text': '#8a6100',
      'on-brand': '#1c1917',
      accent: '#b45309',
      'accent-tint': '#fdf3e7',
    },
  },
  {
    id: 'karu_night',
    name: 'Karu night',
    source: 'karu',
    palette: ['#0c0a09', '#fbd301', '#a8a29e', '#1c1917', '#f5f5f4', '#f87171'],
    overrides: { surface: '#1c1917', 'on-brand': '#1c1917', 'brand-text': '#fbd301' },
  },
  { id: 'savanna', name: 'Savanna', source: 'karu', palette: ['#fbfaf5', '#2f6b3e', '#5d6655', '#f1f0e4', '#1d3123', '#b42318'] },
  { id: 'atlantic', name: 'Atlantic', source: 'karu', palette: ['#f7fafb', '#1a6683', '#546470', '#edf3f5', '#0e2738', '#b42318'] },
  {
    id: 'contrast',
    name: 'High contrast',
    source: 'karu',
    palette: ['#ffffff', '#fbd301', '#333333', '#f2f2f2', '#000000', '#a3160a'],
    overrides: { 'brand-text': '#5c4100', 'on-brand': '#000000', 'slate-500': '#333333', 'slate-200': '#6b6b6b' },
  },
];

function fullHex(hex: string): string {
  const h = hex.replace('#', '').toLowerCase();
  return '#' + (h.length === 3 || h.length === 4 ? [...h.slice(0, 3)].map((c) => c + c).join('') : h.slice(0, 6));
}

const titleCase = (id: string) => (id.charAt(0).toUpperCase() + id.slice(1)).replace(/_/g, ' ');

/** Karu's own themes first, then every Monkeytype palette A–Z. */
export const THEMES: ThemeEntry[] = [
  ...KARU_THEMES,
  ...Object.entries(MONKEYTYPE_PALETTES).map(([id, palette]) => ({
    id,
    name: titleCase(id),
    source: 'monkeytype' as const,
    // Some palettes use shorthand (#fff); every token is full #rrggbb.
    palette: palette.map(fullHex) as unknown as MonkeytypePalette,
  })),
];

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));
export const themeById = (id: string): ThemeEntry | undefined => BY_ID.get(id);

// ── Colour maths ────────────────────────────────────────────────────────────

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}
const toHex = (rgb: Rgb) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');

/** `t` of the way from a to b. */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb);
}

export function luminance(hex: string): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Nudge `fg` toward `toward` until it reaches `min` contrast on every one
 *  of `bgs`. If even that can't get there (a mid-tone background), fall back
 *  to whichever of black or white reads best. */
function readable(fg: string, bgs: string | string[], min: number, toward: string): string {
  const list = Array.isArray(bgs) ? bgs : [bgs];
  const ok = (c: string) => list.every((bg) => contrast(c, bg) >= min);
  for (let i = 0; i <= 20; i++) {
    const c = mix(fg, toward, i / 20);
    if (ok(c)) return c;
  }
  const worst = (c: string) => Math.min(...list.map((bg) => contrast(c, bg)));
  return worst('#000000') >= worst('#ffffff') ? '#000000' : '#ffffff';
}

// ── Tokens ──────────────────────────────────────────────────────────────────

const RAMP_STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;
type RampStep = (typeof RAMP_STEPS)[number];

export type TokenName =
  | 'page' | 'surface'
  | `slate-${RampStep}`
  | 'brand' | 'brand-dark' | 'brand-tint' | 'brand-text' | 'on-brand'
  | 'accent' | 'accent-tint'
  | 'danger' | 'danger-tint' | 'success' | 'success-tint' | 'warn' | 'warn-tint';

export interface ThemeVars {
  dark: boolean;
  tokens: Record<TokenName, string>;
}

/** Turn a theme into the full token set. Pure, so it is unit-tested. */
export function themeVars(theme: ThemeEntry): ThemeVars {
  const [rawBg, main, sub, , text, error] = theme.palette;
  const dark = luminance(rawBg) < luminance(text);
  const extreme = dark ? '#ffffff' : '#000000';
  // A mid-grey page (a few Monkeytype palettes) can't hold readable text in
  // any colour; lift it away from the text just enough that it can.
  let bg = rawBg;
  for (let i = 1; i <= 10 && contrast(extreme, bg) < 7; i++) bg = mix(rawBg, dark ? '#000000' : '#ffffff', i / 10);
  const o = theme.overrides ?? {};

  const surface = o.surface ?? (dark ? mix(bg, text, 0.06) : mix(bg, '#ffffff', 0.7));

  // Neutral ramp from the page colour to the text colour. Tailwind's slate-*
  // class names stay in the markup (as in NourishwithB); only values change.
  const share: Record<RampStep, number> = {
    '50': 0.035, '100': 0.07, '200': 0.14, '300': 0.24, '400': 0.42, '500': 0.56,
    '600': 0.7, '700': 0.8, '800': 0.9, '900': 1, '950': 1,
  };
  const ramp = Object.fromEntries(
    RAMP_STEPS.map((s) => [`slate-${s}`, s === '950' ? mix(text, extreme, 0.3) : mix(bg, text, share[s])]),
  ) as Record<`slate-${RampStep}`, string>;
  // Text steps must read on both the page and cards. Monkeytype palettes are
  // often softer than that by design, so they get pushed toward black or
  // white as far as needed, and no further.
  const both = [bg, surface];
  ramp['slate-900'] = readable(text, both, 7, extreme);
  ramp['slate-800'] = readable(ramp['slate-800'], both, 6, extreme);
  ramp['slate-700'] = readable(ramp['slate-700'], both, 5, extreme);
  ramp['slate-600'] = readable(ramp['slate-600'], both, 4.6, extreme);
  // Muted text keeps the palette's own "sub" colour where it is readable.
  ramp['slate-400'] = sub;
  ramp['slate-500'] = readable(sub, both, 4.5, ramp['slate-900']);

  const onBrand =
    [text, bg, '#1c1917', '#000000', '#ffffff'].map((c) => [c, contrast(c, main)] as const).sort((a, b) => b[1] - a[1])[0][0];
  const brandText = readable(main, both, 4.5, ramp['slate-900']);

  const tokens: Record<TokenName, string> = {
    page: bg,
    surface,
    ...ramp,
    brand: main,
    'brand-dark': mix(main, extreme, 0.12),
    'brand-tint': mix(surface, main, dark ? 0.18 : 0.12),
    'brand-text': brandText,
    'on-brand': onBrand,
    accent: brandText,
    'accent-tint': mix(surface, main, dark ? 0.18 : 0.12),
    danger: readable(error, both, 4.5, ramp['slate-900']),
    'danger-tint': mix(surface, error, dark ? 0.2 : 0.1),
    success: readable(dark ? '#7cc35a' : '#3f7d20', both, 4.5, ramp['slate-900']),
    'success-tint': mix(surface, '#3f7d20', dark ? 0.25 : 0.1),
    warn: readable(dark ? '#f5b971' : '#92400e', both, 4.5, ramp['slate-900']),
    'warn-tint': dark ? mix(surface, '#f59e0b', 0.18) : '#fef3c7',
  };
  for (const [k, v] of Object.entries(o)) tokens[k as TokenName] = v as string;
  return { dark, tokens };
}

// ── Applying and remembering ────────────────────────────────────────────────

const MODE_KEY = 'karu-mode';
const APPEARANCE_KEY = 'karu-appearance';
/** An admin trying palettes before saving them for everyone. This tab only. */
const PREVIEW_KEY = 'karu-theme-preview';

const store = (s: Storage | undefined, k: string, v?: string | null): string | null => {
  try {
    if (!s) return null;
    if (v === undefined) return s.getItem(k);
    if (v === null) s.removeItem(k);
    else s.setItem(k, v);
  } catch {
    // Private mode or blocked storage: works for this visit, isn't remembered.
  }
  return null;
};
const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage);
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);
const darkQuery = () => (typeof window === 'undefined' ? undefined : window.matchMedia?.('(prefers-color-scheme: dark)'));

export function savedMode(): Mode {
  const v = store(local(), MODE_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function cachedAppearance(): Appearance {
  try {
    const v = JSON.parse(store(local(), APPEARANCE_KEY) ?? 'null') as Partial<Appearance> | null;
    if (v?.light && v?.dark) return { light: v.light, dark: v.dark };
  } catch {
    // Corrupt cache: ignore it.
  }
  return DEFAULT_APPEARANCE;
}

export function previewTheme(): string | null {
  return store(session(), PREVIEW_KEY);
}

let current: Appearance = DEFAULT_APPEARANCE;
const listeners = new Set<() => void>();
export const onThemeChange = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function resolvedDark(mode: Mode = savedMode()): boolean {
  return mode === 'dark' || (mode === 'system' && !!darkQuery()?.matches);
}

/** Which theme id is on screen right now. */
export function activeThemeId(): string {
  const preview = previewTheme();
  if (preview && themeById(preview)) return preview;
  return resolvedDark() ? current.dark : current.light;
}

/** Write the active theme's tokens onto <html>. */
function paint(): void {
  if (typeof document === 'undefined') return;
  const fallback = resolvedDark() ? DEFAULT_APPEARANCE.dark : DEFAULT_APPEARANCE.light;
  const theme = themeById(activeThemeId()) ?? themeById(fallback)!;
  const { dark, tokens } = themeVars(theme);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty(`--color-${name}`, value);
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.dataset.theme = theme.id;
  root.dataset.mode = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.surface);
  listeners.forEach((fn) => fn());
}

export function setMode(mode: Mode): void {
  store(local(), MODE_KEY, mode === 'system' ? null : mode);
  paint();
}

/** The site-wide choice arrived (from the API, or an admin just saved it). */
export function setAppearance(a: Appearance): void {
  current = { light: themeById(a.light) ? a.light : DEFAULT_APPEARANCE.light, dark: themeById(a.dark) ? a.dark : DEFAULT_APPEARANCE.dark };
  store(local(), APPEARANCE_KEY, JSON.stringify(current));
  paint();
}

export function setPreview(id: string | null): void {
  store(session(), PREVIEW_KEY, id);
  paint();
}

/** Before first render: last known site look + this device's mode, so the
 *  page never flashes the wrong colours. Follows OS changes on 'system'. */
export function initTheme(): void {
  current = cachedAppearance();
  paint();
  darkQuery()?.addEventListener?.('change', () => {
    if (savedMode() === 'system') paint();
  });
}
