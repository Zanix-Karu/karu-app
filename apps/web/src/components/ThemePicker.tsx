import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { THEMES, applyTheme, savedTheme, type ThemeId } from '../lib/theme';

/**
 * Monkeytype-style theme swatches (IDEAS #11). `compact` is the header
 * button with a popover; the full grid sits on the profile page.
 */
export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<ThemeId>(savedTheme);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const choose = (id: ThemeId) => {
    applyTheme(id);
    setCurrent(id);
    setOpen(false);
  };

  // Close the popover on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const grid = (
    <div role="radiogroup" aria-label={t('theme.label')} className="karu-theme-grid">
      {THEMES.map((th) => (
        <button
          key={th.id}
          type="button"
          role="radio"
          aria-checked={current === th.id}
          onClick={() => choose(th.id)}
          className="karu-theme-option"
        >
          <span className="karu-theme-swatch" aria-hidden>
            {th.swatch.map((c, i) => (
              <span key={i} style={{ background: c }} />
            ))}
          </span>
          <span className="karu-theme-name">{t(th.label)}</span>
        </button>
      ))}
    </div>
  );

  if (!compact) return grid;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t('theme.label')}
        title={t('theme.label')}
        onClick={() => setOpen((v) => !v)}
        className="grid h-7 w-7 place-items-center rounded-full text-karu-on-chrome/70 transition hover:text-karu-yellow focus:outline-none focus-visible:ring-2 focus-visible:ring-karu-yellow/60"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.4-1.2-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.2-4-7.5-9-7.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <circle cx="7.5" cy="11" r="1.3" fill="currentColor" />
          <circle cx="10.5" cy="7" r="1.3" fill="currentColor" />
          <circle cx="15" cy="7.5" r="1.3" fill="currentColor" />
        </svg>
      </button>
      {open && <div className="karu-theme-popover karu-pop-in">{grid}</div>}
    </div>
  );
}
