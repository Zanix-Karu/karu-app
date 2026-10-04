/**
 * Colour themes (IDEAS #11). The palettes themselves live in ds/themes.css;
 * this is the list, the swatches the picker shows, and persistence.
 *
 * Stored per device in localStorage: it's how this phone should look, not a
 * fact about the account. 'system' follows the OS light/dark setting.
 */
export type ThemeId = 'system' | 'karu' | 'night' | 'savanna' | 'atlantic' | 'contrast';

export interface ThemeOption {
  id: ThemeId;
  /** i18n key under theme.name. */
  label: string;
  /** Background, surface, accent, text: drawn as the picker swatch. */
  swatch: [string, string, string, string];
}

export const THEMES: ThemeOption[] = [
  { id: 'system', label: 'theme.name.system', swatch: ['#f4efe7', '#15100b', '#fbd301', '#1c1006'] },
  { id: 'karu', label: 'theme.name.karu', swatch: ['#f4efe7', '#ffffff', '#fbd301', '#1c1006'] },
  { id: 'night', label: 'theme.name.night', swatch: ['#15100b', '#221a13', '#fbd301', '#f1e9dc'] },
  { id: 'savanna', label: 'theme.name.savanna', swatch: ['#f1f0e4', '#ffffff', '#2f6b3e', '#1d3123'] },
  { id: 'atlantic', label: 'theme.name.atlantic', swatch: ['#edf3f5', '#ffffff', '#1a6683', '#0e2738'] },
  { id: 'contrast', label: 'theme.name.contrast', swatch: ['#ffffff', '#ffffff', '#fbd301', '#000000'] },
];

const KEY = 'karu-theme';
const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');

export function savedTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY) as ThemeId | null;
    return v && THEMES.some((t) => t.id === v) ? v : 'system';
  } catch {
    // Private mode or blocked storage: fall back, never break the page.
    return 'system';
  }
}

/** Set the theme on <html> (resolving 'system'), and remember the choice. */
export function applyTheme(id: ThemeId, persist = true): void {
  const resolved = id === 'system' ? (darkQuery()?.matches ? 'night' : 'karu') : id;
  document.documentElement.dataset.theme = resolved;
  if (persist) {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // Applied for this visit; just not remembered.
    }
  }
}

/** Apply the saved theme before first paint, and follow OS changes on 'system'. */
export function initTheme(): void {
  applyTheme(savedTheme(), false);
  darkQuery()?.addEventListener?.('change', () => {
    if (savedTheme() === 'system') applyTheme('system', false);
  });
}
