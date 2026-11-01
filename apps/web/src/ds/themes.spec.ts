import { describe, expect, it } from 'vitest';
import { THEMES, contrast, mix, themeVars, type TokenName } from '../lib/theme';

/**
 * Every theme the admin can pick (Karu's own and all of Monkeytype's) must
 * stay readable once mapped onto Karu. Monkeytype palettes were designed for
 * a typing test, not buttons and forms, so themeVars() adjusts colours that
 * fall short; this checks it did, for every theme, against WCAG AA.
 */

/** [foreground, background, minimum ratio, what it is]. */
const PAIRS: Array<[TokenName, TokenName, number, string]> = [
  ['slate-900', 'surface', 4.5, 'headings on cards'],
  ['slate-700', 'surface', 4.5, 'body text on cards'],
  ['slate-600', 'surface', 4.5, 'secondary text on cards'],
  ['slate-500', 'surface', 4.5, 'muted labels on cards'],
  ['slate-900', 'page', 4.5, 'text on the page'],
  ['brand-text', 'surface', 4.5, 'links and brand-coloured text'],
  ['on-brand', 'brand', 4.5, 'text on brand buttons'],
  ['danger', 'surface', 4.5, 'error text'],
  ['success', 'surface', 4.5, 'success text'],
  ['warn', 'surface', 4.5, 'warning text'],
];

describe('theme contrast (WCAG AA)', () => {
  it('has the Karu themes and every Monkeytype palette', () => {
    expect(THEMES.filter((t) => t.source === 'karu').map((t) => t.id)).toEqual([
      'karu',
      'karu_night',
      'savanna',
      'atlantic',
      'contrast',
    ]);
    expect(THEMES.filter((t) => t.source === 'monkeytype').length).toBeGreaterThan(180);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
  });

  for (const theme of THEMES) {
    it(`${theme.id} keeps every pairing readable`, () => {
      const { tokens } = themeVars(theme);
      for (const [name, value] of Object.entries(tokens)) {
        expect(value, `${theme.id} ${name}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
      const failures = PAIRS.filter(([fg, bg, min]) => contrast(tokens[fg], tokens[bg]) < min).map(
        ([fg, bg, min, what]) => `${what}: ${fg} on ${bg} = ${contrast(tokens[fg], tokens[bg]).toFixed(2)} < ${min}`,
      );
      expect(failures).toEqual([]);
    });
  }

  it('keeps the Karu light theme on Nourish stone and Karu yellow', () => {
    const { dark, tokens } = themeVars(THEMES[0]);
    expect(dark).toBe(false);
    expect(tokens.brand).toBe('#fbd301');
    expect(tokens['slate-200']).toBe('#e7e5e4');
    expect(tokens.surface).toBe('#ffffff');
  });

  it('mixes colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#fff', '#000', 0)).toBe('#ffffff');
  });
});
