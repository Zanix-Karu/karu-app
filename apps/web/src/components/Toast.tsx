import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Toasts, ported from the starter pack's UI kit. One provider at the app root
 * and a `useToast()` hook, so a screen can say "Saved" or report a failure
 * without owning any state. Replaces window.alert(), which embedded browsers
 * and webviews suppress (see ConfirmButton for the same problem).
 *
 * A toast plays its exit before it unmounts, and the region is polite so a
 * screen reader finishes what it is saying first. Errors stay up longer.
 */
type ToastVariant = 'default' | 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  state: 'enter' | 'open' | 'closing';
}

type Show = (message: string, variant?: ToastVariant) => void;

const ToastContext = createContext<Show | null>(null);

/** Matches --motion-base, the toast's exit time in ds/motion.css. */
const EXIT_MS = 200;

const ICONS = { default: Info, success: CircleCheck, error: CircleAlert } as const;
const ICON_COLOUR = {
  default: 'text-brand-text',
  success: 'text-[var(--success)]',
  error: 'text-danger',
} as const;

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, state: 'closing' } : i)));
    setTimeout(
      () => setItems((list) => list.filter((i) => i.id !== id)),
      reducedMotion() ? 0 : EXIT_MS,
    );
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback<Show>(
    (message, variant = 'default') => {
      const id = nextId.current++;
      // Keep at most three on screen; the oldest goes first.
      setItems((list) => [...list.slice(-2), { id, message, variant, state: 'enter' }]);
      // Next frame, so the closed styles paint first and the entrance runs.
      requestAnimationFrame(() =>
        setItems((list) => list.map((i) => (i.id === id ? { ...i, state: 'open' } : i))),
      );
      timers.current.set(id, setTimeout(() => dismiss(id), variant === 'error' ? 8000 : 4500));
    },
    [dismiss],
  );

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        {items.map((item) => {
          const Icon = ICONS[item.variant];
          return (
            <div
              key={item.id}
              role={item.variant === 'error' ? 'alert' : 'status'}
              data-state={item.state}
              className="toast-motion pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-slate-900/10 bg-surface py-3 pr-2 pl-4 text-sm text-slate-900 shadow-lg"
            >
              <Icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${ICON_COLOUR[item.variant]}`} />
              <p className="min-w-0 flex-1">{item.message}</p>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label={t('common.dismiss')}
                className="karu-icon-btn shrink-0 text-slate-500 hover:text-slate-900"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Show {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>');
  return show;
}
