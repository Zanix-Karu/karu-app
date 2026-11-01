import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

/**
 * Small controls ported from the starter pack's UI kit, in Karu colours:
 * Tooltip, Switch and Checkbox. All three are CSS-only and respect
 * prefers-reduced-motion through ds/motion.css.
 */

/**
 * A label shown above its trigger on hover or keyboard focus. Replaces the
 * browser's `title` tooltip, which is slow, unstyled and never shown to
 * keyboard or touch users. It waits a moment so it doesn't flicker as the
 * pointer passes, and the trigger is described by it for screen readers.
 */
export function Tooltip({
  content,
  children,
  className = '',
}: {
  /** Nothing to say (null/false) renders just the trigger. */
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  if (content == null || content === false) return <>{children}</>;
  return (
    <span className={`group/tooltip relative inline-flex ${className}`} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={[
          'pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-56 -translate-x-1/2 translate-y-1 scale-[0.97]',
          'rounded-lg bg-slate-900 px-2.5 py-1.5 text-center text-xs font-medium leading-snug text-surface opacity-0 shadow-lg',
          'origin-bottom transition-[opacity,translate,scale,visibility] duration-150 ease-out',
          'group-hover/tooltip:visible group-hover/tooltip:translate-y-0 group-hover/tooltip:scale-100 group-hover/tooltip:opacity-100 group-hover/tooltip:delay-300',
          'group-focus-within/tooltip:visible group-focus-within/tooltip:translate-y-0 group-focus-within/tooltip:scale-100 group-focus-within/tooltip:opacity-100',
        ].join(' ')}
      >
        {content}
      </span>
    </span>
  );
}

type BoxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * An on/off switch for settings. A real checkbox with role="switch", so it
 * works with labels, forms and screen readers ("on"/"off"). The knob glides
 * across and stretches a little while pressed.
 */
export const Switch = forwardRef<HTMLInputElement, BoxProps>(({ className = '', ...props }, ref) => (
  <span className="relative inline-flex h-7 w-12 shrink-0 items-center">
    <input
      type="checkbox"
      role="switch"
      ref={ref}
      className={`karu-focus peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full bg-slate-900/20 transition-colors duration-200 checked:bg-brand disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
    <span
      aria-hidden="true"
      className="pointer-events-none relative ml-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-[translate,width] duration-200 ease-[var(--ease-out)] peer-checked:translate-x-5 peer-active:w-[27px] peer-checked:peer-active:translate-x-[15px]"
    />
  </span>
));
Switch.displayName = 'Switch';

/**
 * A real checkbox drawn as a brand-coloured box whose tick draws itself in.
 * The wrapper keeps a 44px touch target around the 20px box.
 */
export const Checkbox = forwardRef<HTMLInputElement, BoxProps & { wrapperClassName?: string }>(
  ({ className = '', wrapperClassName = '', ...props }, ref) => (
  <span className={`relative inline-grid min-h-11 min-w-11 shrink-0 place-items-center *:[grid-area:1/1] ${wrapperClassName}`}>
    <input
      type="checkbox"
      ref={ref}
      className={`karu-focus peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-[5px] border-[1.5px] border-slate-900/40 bg-surface transition-[background-color,border-color,scale] duration-150 active:scale-90 checked:border-brand checked:bg-brand disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="pointer-events-none h-3.5 w-3.5 fill-none stroke-on-brand [stroke-dasharray:24] [stroke-dashoffset:24] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:3] transition-[stroke-dashoffset] delay-[80ms] duration-200 peer-checked:[stroke-dashoffset:0]"
    >
      <path d="M3 8.5l3.2 3L13 4.5" />
    </svg>
  </span>
  ),
);
Checkbox.displayName = 'Checkbox';
