import { describe, expect, it, vi } from 'vitest';
import { DeepLProvider, NullTranslationProvider, guessLanguage } from './translation';

const okResponse = (text: string) =>
  ({ ok: true, json: async () => ({ translations: [{ text }] }) }) as unknown as Response;

describe('NullTranslationProvider', () => {
  it('reports that it cannot translate rather than failing later', () => {
    expect(new NullTranslationProvider().canTranslate).toBe(false);
  });

  it('throws if called anyway, so a missing key can never look like a translation', async () => {
    await expect(new NullTranslationProvider().translate()).rejects.toThrow();
  });
});

describe('DeepLProvider', () => {
  it('routes free keys to the free host', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse('The car was clean.'));
    await new DeepLProvider({ apiKey: 'abc:fx', fetchFn }).translate('La voiture', 'en');

    expect(fetchFn.mock.calls[0][0]).toBe('https://api-free.deepl.com/v2/translate');
  });

  it('routes paid keys to the paid host', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse('x'));
    await new DeepLProvider({ apiKey: 'abc', fetchFn }).translate('y', 'en');

    expect(fetchFn.mock.calls[0][0]).toBe('https://api.deepl.com/v2/translate');
  });

  it('asks for EN-GB, not EN — the rest of the product is British English', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse('x'));
    await new DeepLProvider({ apiKey: 'k:fx', fetchFn }).translate('y', 'en');

    expect(String(fetchFn.mock.calls[0][1].body)).toContain('target_lang=EN-GB');
  });

  it('does not leak the provider response body into the error', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 456,
      text: async () => 'quota exceeded for key sk-secret',
    } as unknown as Response);

    await expect(
      new DeepLProvider({ apiKey: 'k:fx', fetchFn }).translate('y', 'en'),
    ).rejects.toThrow(/^Translation failed \(456\)$/);
  });

  it('refuses an empty translation rather than blanking the review', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ translations: [] }),
    } as unknown as Response);

    await expect(
      new DeepLProvider({ apiKey: 'k:fx', fetchFn }).translate('y', 'en'),
    ).rejects.toThrow();
  });
});

describe('guessLanguage', () => {
  it('recognises French', () => {
    expect(guessLanguage('La voiture est très propre et le prestataire pour nous')).toBe('fr');
  });

  it('recognises English', () => {
    expect(guessLanguage('The car was very clean and the provider was great')).toBe('en');
  });

  it('returns null rather than guessing when there is nothing to go on', () => {
    // A wrong guess costs a needless "Translate" link; a null costs nothing.
    expect(guessLanguage('OK')).toBeNull();
  });
});
