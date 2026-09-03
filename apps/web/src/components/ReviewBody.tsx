import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { Review } from '@karu/shared';
import { api } from '../lib/api';

/**
 * A review's text, in the language it was written in, with an opt-in
 * translation.
 *
 * Two problems this fixes. A French review sat on the English site with an
 * English `lang` attribute, so a screen reader read French aloud in an English
 * voice. And a reader had no way to understand it at all.
 *
 * The original is what renders. Translation is asked for, labelled as machine
 * output, and reversible: silently swapping a customer's words for a machine's
 * would misrepresent what they said, and the reader could not tell.
 */
export function ReviewBody({ review }: { review: Review }) {
  const { t, i18n } = useTranslation();
  const [showTranslation, setShowTranslation] = useState(false);

  const readerLang = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';
  const sourceLang = review.language;
  // Only offer it when we know the languages differ. An unknown source (a
  // review written before we recorded it) gets no control rather than a guess.
  const differs = Boolean(sourceLang && sourceLang !== readerLang);

  const { data: available } = useQuery({
    queryKey: ['translation-status'],
    queryFn: () => api<{ available: boolean }>('/translation/status'),
    staleTime: Infinity,
    enabled: differs,
  });

  const translation = useQuery({
    queryKey: ['review-translation', review.id, readerLang],
    queryFn: () => api<{ body: string }>(`/reviews/${review.id}/translation?to=${readerLang}`),
    enabled: showTranslation,
  });

  if (!review.comment) return null;

  const showing = showTranslation && translation.data?.body;

  return (
    <div style={{ marginTop: 8 }}>
      <p
        // The attribute follows whichever text is on screen, so assistive tech
        // switches voice with it.
        lang={showing ? readerLang : sourceLang ?? undefined}
        style={{ fontFamily: 'var(--font-ui)', fontSize: 14, lineHeight: 1.5, margin: 0 }}
      >
        &ldquo;{showing ? translation.data?.body : review.comment}&rdquo;
      </p>

      {differs && available?.available && (
        <button
          type="button"
          onClick={() => setShowTranslation((v) => !v)}
          style={{
            marginTop: 6,
            padding: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-link)',
            textDecoration: 'underline',
          }}
        >
          {translation.isFetching
            ? t('reviews.translating')
            : showing
              ? t('reviews.showOriginal')
              : t('reviews.translate', { lang: t(`reviews.lang.${sourceLang}`) })}
        </button>
      )}

      {showing && (
        <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--gray-400)' }}>
          {t('reviews.machineTranslated', { lang: t(`reviews.lang.${sourceLang}`) })}
        </p>
      )}

      {translation.isError && (
        <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--danger)' }}>
          {t('reviews.translateFailed')}
        </p>
      )}
    </div>
  );
}
