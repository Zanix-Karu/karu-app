import { describe, expect, it } from 'vitest';
import { en } from './en';
import { fr } from './fr';

/**
 * REQ-11: a translation-completeness check, modelled on the marketing repo's
 * `check:translations` script (there, over flat JSON message files; here,
 * over the two TS objects directly, since that's what this app actually
 * ships — no build step to run first).
 *
 * Flattens each locale to a set of dot-paths (`vendor.docs.type.rccm`) and
 * diffs them. Array leaves (e.g. `customerPoints: [...]`) are a single leaf,
 * not walked further — one locale having 3 bullet points and the other 4 is
 * a translation *decision*, not a missing key, and out of scope for this
 * check.
 */
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (Array.isArray(obj) || typeof obj !== 'object' || obj === null) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return keyPaths(value, path);
  });
}

describe('i18n key parity (REQ-11)', () => {
  it('has no key in en missing from fr', () => {
    const enKeys = new Set(keyPaths(en));
    const frKeys = new Set(keyPaths(fr));
    const missingInFr = [...enKeys].filter((k) => !frKeys.has(k));
    expect(missingInFr).toEqual([]);
  });

  it('has no key in fr missing from en', () => {
    const enKeys = new Set(keyPaths(en));
    const frKeys = new Set(keyPaths(fr));
    const missingInEn = [...frKeys].filter((k) => !enKeys.has(k));
    expect(missingInEn).toEqual([]);
  });

  /**
   * A value with `{{placeholder}}` interpolation in one locale but not the
   * other is usually a translation bug (i18next silently prints the literal
   * `{{count}}` if the French string forgot it) rather than a stylistic
   * choice, so this is worth catching even though it's a step beyond plain
   * key parity.
   */
  it('uses the same {{placeholders}} on both sides of every shared key', () => {
    const placeholdersOf = (value: unknown): string[] =>
      typeof value === 'string' ? [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort() : [];

    const walk = (a: unknown, b: unknown, prefix: string, mismatches: string[]) => {
      if (typeof a === 'string' && typeof b === 'string') {
        const pa = placeholdersOf(a);
        const pb = placeholdersOf(b);
        if (pa.join(',') !== pb.join(',')) mismatches.push(prefix);
        return;
      }
      if (
        typeof a === 'object' &&
        a !== null &&
        !Array.isArray(a) &&
        typeof b === 'object' &&
        b !== null &&
        !Array.isArray(b)
      ) {
        for (const key of Object.keys(a as Record<string, unknown>)) {
          const bv = (b as Record<string, unknown>)[key];
          if (bv !== undefined) {
            walk((a as Record<string, unknown>)[key], bv, prefix ? `${prefix}.${key}` : key, mismatches);
          }
        }
      }
    };

    const mismatches: string[] = [];
    walk(en, fr, '', mismatches);
    expect(mismatches).toEqual([]);
  });
});
