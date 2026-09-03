/**
 * The seam a translation engine drops into.
 *
 * Same shape as the payments adapter: build to the interface, ship a null
 * implementation, and let one env var turn the real thing on. Without a key
 * the app must not pretend it can translate — `canTranslate` is false and the
 * UI hides the control rather than offering a button that errors.
 *
 * DeepL over Google Translate for two reasons: FR<->EN is the pair it is best
 * at, which matters when the text is a customer complaining about a car, and
 * its free tier covers this volume many times over. The browser widget was
 * rejected outright — it rewrites the whole page, fighting the app's own
 * translations, and needs a third-party script the CSP blocks.
 */
export interface TranslationProvider {
  readonly name: string;
  readonly canTranslate: boolean;
  translate(text: string, targetLang: 'en' | 'fr'): Promise<string>;
}

/** Ships when no key is configured. Never claims to have translated anything. */
export class NullTranslationProvider implements TranslationProvider {
  readonly name = 'none';
  readonly canTranslate = false;

  async translate(): Promise<string> {
    throw new Error('No translation provider is configured');
  }
}

export class DeepLProvider implements TranslationProvider {
  readonly name = 'deepl';
  readonly canTranslate = true;

  constructor(
    private readonly opts: {
      apiKey: string;
      /** Free keys end in ':fx' and use a different host. */
      fetchFn?: typeof fetch;
    },
  ) {}

  private get endpoint(): string {
    return this.opts.apiKey.endsWith(':fx')
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';
  }

  async translate(text: string, targetLang: 'en' | 'fr'): Promise<string> {
    const doFetch = this.opts.fetchFn ?? fetch;
    const res = await doFetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${this.opts.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      // EN-GB rather than EN: the rest of the product is British English.
      body: new URLSearchParams({
        text,
        target_lang: targetLang === 'en' ? 'EN-GB' : 'FR',
      }).toString(),
    });
    if (!res.ok) {
      // The provider's response body is not the reader's problem and may echo
      // the text back; log-worthy, not user-facing.
      throw new Error(`Translation failed (${res.status})`);
    }
    const json = (await res.json()) as { translations?: Array<{ text: string }> };
    const out = json.translations?.[0]?.text;
    if (!out) throw new Error('Translation returned nothing');
    return out;
  }
}

/**
 * Best-effort language guess for text whose author we cannot ask.
 *
 * Only used as a fallback for reviews written before 0024 started recording
 * the author's own locale. Deliberately crude: function words are the cheapest
 * reliable signal for a two-language problem, and a wrong guess costs a
 * needless "Translate" link, not a wrong translation.
 */
export function guessLanguage(text: string): 'en' | 'fr' | null {
  const t = ` ${text.toLowerCase()} `;
  const fr = [' le ', ' la ', ' les ', ' une ', ' des ', ' est ', ' très ', ' pas ', ' avec ', ' pour ', ' bien ', ' voiture ', ' était '];
  const en = [' the ', ' a ', ' was ', ' very ', ' with ', ' and ', ' but ', ' car ', ' good ', ' great ', ' would '];
  const score = (words: string[]) => words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
  const f = score(fr);
  const e = score(en);
  if (f === e) return null;
  return f > e ? 'fr' : 'en';
}
