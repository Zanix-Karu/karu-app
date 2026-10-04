import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../lib/theme';

/**
 * IDEAS #11: every theme must stay readable. Reads the real CSS, resolves
 * each theme's variables (tokens.css defaults, then the theme's overrides),
 * and checks the pairings the app actually uses against WCAG AA.
 */
const css = (f: string) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');

function vars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

function blockFor(source: string, selector: RegExp): string {
  const m = selector.exec(source);
  if (!m) return '';
  const start = source.indexOf('{', m.index);
  return source.slice(start + 1, source.indexOf('}', start));
}

const tokens = vars(blockFor(css('./tokens.css'), /:root\s*\{/));
const themesCss = css('./themes.css');
const base = vars(blockFor(themesCss, /:root,\s*\[data-theme='karu'\]/));

function resolve(theme: string): Record<string, string> {
  const own = theme === 'karu' ? {} : vars(blockFor(themesCss, new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{`)));
  const all = { ...tokens, ...base, ...own };
  const get = (name: string): string => {
    let v = all[name];
    for (let i = 0; i < 5 && v?.startsWith('var('); i++) v = all[v.slice(4, -1).trim()];
    return v;
  };
  return new Proxy({}, { get: (_t, k: string) => get(k) }) as Record<string, string>;
}

function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** [foreground, background, minimum ratio, what it is]. */
const PAIRS: Array<[string, string, number, string]> = [
  ['--k-ink', '--k-cream', 4.5, 'page text'],
  ['--k-ink', '--k-surface', 4.5, 'card text'],
  ['--k-brown', '--k-cream', 4.5, 'accent text on the page'],
  ['--k-mute', '--k-surface', 3, 'muted labels on cards (large/secondary)'],
  ['--k-on-chrome', '--k-chrome', 4.5, 'header text'],
  ['--k-on-brand', '--k-yellow', 4.5, 'text on yellow buttons'],
  ['--brand-ink', '--yellow', 4.5, 'design-system text on yellow'],
  ['--ink', '--white', 4.5, 'design-system card text'],
  ['--gray-500', '--white', 4.5, 'secondary text on DS cards'],
  ['--gold-600', '--white', 3, 'links and secondary actions'],
];

describe('theme contrast (WCAG AA)', () => {
  for (const theme of THEMES.map((t) => t.id).filter((id) => id !== 'system')) {
    it(`${theme} keeps every pairing readable`, () => {
      const v = resolve(theme);
      // An unresolved colour would compare as NaN and pass silently.
      for (const [fg, bg] of PAIRS) {
        expect(v[fg], `${theme} ${fg}`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(v[bg], `${theme} ${bg}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
      const failures = PAIRS.filter(([fg, bg, min]) => contrast(v[fg], v[bg]) < min).map(
        ([fg, bg, min, what]) => `${what}: ${fg} on ${bg} = ${contrast(v[fg], v[bg]).toFixed(2)} < ${min}`,
      );
      expect(failures).toEqual([]);
    });
  }
});
