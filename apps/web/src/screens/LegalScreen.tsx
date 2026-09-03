import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../lib/page-meta';

/**
 * Privacy Policy and Terms, rendered from i18n so both languages stay in step.
 *
 * These deliberately do NOT reuse the marketing site's copy. That policy was
 * written for a waitlist — "we collect your email address, user type and city"
 * — while this app also handles identity documents, RCCM paperwork, phone
 * numbers, addresses, bookings, payments and messages between parties.
 * Reusing it would have understated collection, which is worse than having no
 * page at all.
 *
 * The sections below describe what the schema actually stores. Retention
 * periods, sub-processors and the legal bases still need sign-off from someone
 * who can speak for the business — see FEAT-4 in the QA findings.
 */
export function LegalScreen({ doc }: { doc: 'privacy' | 'terms' }) {
  const { t } = useTranslation();
  const sections = t(`${doc}.sections`, { returnObjects: true }) as unknown as Array<{
    title: string;
    body: string;
  }>;

  usePageMeta({ title: t(`${doc}.title`) });

  return (
    <article style={{ maxWidth: 760 }}>
      <Link
        to="/"
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-link)',
          textDecoration: 'none',
        }}
      >
        {t('legal.back')}
      </Link>

      <h1
        style={{
          margin: '18px 0 4px',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 40,
          color: 'var(--ink)',
        }}
      >
        {t(`${doc}.title`)}
      </h1>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-400)' }}>
        {t(`${doc}.updated`)}
      </p>

      {Array.isArray(sections) &&
        sections.map((s) => (
          <section key={s.title} style={{ marginTop: 28 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                fontSize: 17,
                color: 'var(--ink)',
              }}
            >
              {s.title}
            </h2>
            <p
              style={{
                margin: '8px 0 0',
                fontFamily: 'var(--font-ui)',
                fontSize: 15,
                lineHeight: 1.75,
                color: 'var(--gray-500)',
              }}
            >
              {s.body}
            </p>
          </section>
        ))}
    </article>
  );
}
