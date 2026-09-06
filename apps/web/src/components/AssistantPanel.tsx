import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useView } from '../lib/auth';
import type { View } from '../lib/roles';

/**
 * FEAT-2 — Karu assistant. A slide-in help panel: a right-hand side panel on
 * desktop, a bottom sheet on mobile (Base's bottom-sheet pattern — slide, not
 * fade; dim backdrop; one primary surface). It is deliberately rule-based for
 * now — a small, context-aware FAQ with deep links — so it ships without an LLM
 * bill. `answerFor()` is the single seam to swap in a model later: return its
 * text from an API call instead of the i18n table and the rest stays put.
 *
 * It is separate from the booking Messages thread (that is human↔human between
 * a customer and a vendor); this is Karu helping either party use the product.
 */

interface Topic {
  id: string;
  /** Deep links shown under the answer. */
  links?: { labelKey: string; to: string }[];
}

// Which topics each view sees, in order. Guests get orientation + both paths;
// customers get booking help; vendors get listing/verification help.
const TOPICS_BY_VIEW: Record<View, Topic[]> = {
  guest: [
    { id: 'how_it_works' },
    { id: 'book', links: [{ labelKey: 'nav.findCar', to: '/search' }] },
    { id: 'list_car', links: [{ labelKey: 'nav.listYourCar', to: '/list-your-car' }] },
    { id: 'payments' },
    { id: 'privacy' },
  ],
  customer: [
    { id: 'book', links: [{ labelKey: 'nav.findCar', to: '/search' }] },
    { id: 'cancel', links: [{ labelKey: 'nav.myBookings', to: '/bookings' }] },
    { id: 'payments' },
    { id: 'privacy' },
    { id: 'how_it_works' },
  ],
  vendor: [
    { id: 'list_car', links: [{ labelKey: 'nav.myCars', to: '/vendor/cars' }] },
    { id: 'verification', links: [{ labelKey: 'nav.documents', to: '/vendor/documents' }] },
    { id: 'payments' },
    { id: 'privacy' },
    { id: 'how_it_works' },
  ],
  admin: [{ id: 'how_it_works' }, { id: 'payments' }, { id: 'privacy' }],
};

const CLOSE_MS = 250;

export function AssistantPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const view = useView();

  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false); // drives the enter/exit transform
  const [topicId, setTopicId] = useState<string | null>(null);

  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const topics = TOPICS_BY_VIEW[view];
  const topic = topics.find((x) => x.id === topicId) ?? null;

  const openPanel = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
    requestAnimationFrame(() => setShown(true));
  };

  const closePanel = () => {
    setShown(false);
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setTopicId(null);
      launcherRef.current?.focus();
    }, CLOSE_MS);
  };

  // Focus the panel on open; close on Escape.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  /** The single seam for a future model: swap this for an API call. */
  const answerFor = (id: string): string => t(`assistant.topics.${id}.a`);

  return (
    <>
      {/* Launcher — hidden while the panel is open */}
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={openPanel}
          aria-label={t('assistant.launch')}
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-karu-ink text-karu-cream shadow-lg transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-karu-gold focus-visible:ring-offset-2"
        >
          <ChatIcon />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t('assistant.title')}>
          {/* Backdrop */}
          <div
            onClick={closePanel}
            className={`absolute inset-0 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none ${
              shown ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Panel: bottom sheet on mobile, right side panel from sm up */}
          <div
            ref={panelRef}
            tabIndex={-1}
            className={[
              'absolute flex flex-col bg-karu-cream shadow-lg outline-none',
              'inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl',
              'sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-[400px] sm:max-h-none sm:rounded-none',
              'transition-transform duration-200 ease-out motion-reduce:transition-none',
              shown ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-y-0 sm:translate-x-full',
            ].join(' ')}
          >
            {/* Drag handle (mobile affordance only) */}
            <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
              <span className="h-1 w-8 rounded-full bg-karu-ink/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between border-b border-karu-ink/10 px-5 py-4">
              <div>
                <p className="font-display text-lg font-bold text-karu-ink">{t('assistant.title')}</p>
                <p className="text-xs text-karu-mute">{t('assistant.subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={closePanel}
                aria-label={t('assistant.close')}
                className="flex h-9 w-9 items-center justify-center rounded-full text-karu-brown transition hover:bg-karu-ink/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-karu-gold"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {!topic ? (
                <div className="grid gap-2">
                  <p className="mb-1 text-sm text-karu-mute">{t('assistant.intro')}</p>
                  {topics.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => setTopicId(x.id)}
                      className="rounded-md border border-karu-ink/10 bg-white px-4 py-3 text-left text-sm font-medium text-karu-ink transition hover:border-karu-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-karu-gold"
                    >
                      {t(`assistant.topics.${x.id}.q`)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid gap-4">
                  <button
                    type="button"
                    onClick={() => setTopicId(null)}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-karu-brown hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-karu-gold"
                  >
                    ← {t('assistant.back')}
                  </button>
                  <p className="font-display text-lg font-bold text-karu-ink">
                    {t(`assistant.topics.${topic.id}.q`)}
                  </p>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-karu-ink/90">
                    {answerFor(topic.id)}
                  </p>
                  {topic.links && topic.links.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {topic.links.map((l) => (
                        <button
                          key={l.to}
                          type="button"
                          onClick={() => {
                            closePanel();
                            navigate(l.to);
                          }}
                          className="rounded-full bg-karu-yellow px-4 py-2 text-sm font-semibold text-karu-ink transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-karu-gold focus-visible:ring-offset-2"
                        >
                          {t(l.labelKey)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer — escape hatch to a human / the feedback channel */}
            <div className="border-t border-karu-ink/10 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  closePanel();
                  navigate('/feedback');
                }}
                className="text-sm font-semibold text-karu-brown hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-karu-gold"
              >
                {t('assistant.reportCta')} →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H9l-4 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
