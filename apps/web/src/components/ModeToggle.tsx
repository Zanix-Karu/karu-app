import { AnimatePresence, motion } from 'motion/react';
import { Check, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import { EASE_SMOOTH_OUT } from '../lib/motion';
import { onThemeChange, savedMode, setMode, type Mode } from '../lib/theme';

/**
 * Light / dark / match-my-device. This is the only appearance choice a
 * visitor makes; which palettes "light" and "dark" mean is set site-wide by
 * an admin (Admin → Appearance). Remembered on this device.
 */
const MODES: { id: Mode; icon: LucideIcon }[] = [
  { id: 'light', icon: Sun },
  { id: 'dark', icon: Moon },
  { id: 'system', icon: Monitor },
];

function useMode(): Mode {
  return useSyncExternalStore(onThemeChange, savedMode, () => 'system' as Mode);
}

/** Header button with a small menu. */
export function ModeToggle({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const mode = useMode();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const Current = MODES.find((m) => m.id === mode)!.icon;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className={cn('relative', className)}>
      <button
        ref={button}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('theme.mode.label')}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text"
      >
        {/* The icon swaps with the same rotate-and-blur Nourish uses for its menu toggle. */}
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={mode}
            initial={{ opacity: 0, rotate: -90, scale: 0.5, filter: 'blur(2px)' }}
            animate={{ opacity: 1, rotate: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, rotate: 90, scale: 0.5, filter: 'blur(2px)' }}
            transition={{ duration: 0.25, ease: EASE_SMOOTH_OUT }}
            className="flex"
          >
            <Current aria-hidden="true" className="h-5 w-5" />
          </motion.span>
        </AnimatePresence>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="group"
            aria-label={t('theme.mode.label')}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25, ease: EASE_SMOOTH_OUT }}
            className="absolute right-0 top-[calc(100%+6px)] z-50 w-52 origin-top-right rounded-xl border border-slate-200 bg-surface p-1.5 shadow-lg"
          >
            {MODES.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                onClick={() => {
                  setMode(id);
                  setOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text"
              >
                <Icon aria-hidden="true" className="h-4 w-4 text-slate-500" />
                <span className="flex-1">{t(`theme.mode.${id}`)}</span>
                {mode === id && <Check aria-hidden="true" className="h-4 w-4 text-brand-text" strokeWidth={2.5} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Segmented control for the profile page; the pill glides between options. */
export function ModeSegmented() {
  const { t } = useTranslation();
  const mode = useMode();
  return (
    <div role="radiogroup" aria-label={t('theme.mode.label')} className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1">
      {MODES.map(({ id, icon: Icon }) => {
        const on = mode === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setMode(id)}
            className={cn(
              'relative isolate inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text',
              on ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900',
            )}
          >
            {on && (
              <motion.span
                layoutId="mode-segment"
                transition={{ duration: 0.25, ease: EASE_SMOOTH_OUT }}
                className="absolute inset-0 -z-10 rounded-full bg-surface shadow-sm"
                aria-hidden="true"
              />
            )}
            <Icon aria-hidden="true" className="h-4 w-4" />
            {t(`theme.mode.${id}`)}
          </button>
        );
      })}
    </div>
  );
}
