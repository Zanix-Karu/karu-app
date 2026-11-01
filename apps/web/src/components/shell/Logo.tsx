import { cn } from '../../lib/cn';

/**
 * The Karu pin mark and wordmark, drawn inline so the word follows the
 * theme's text colour (the shipped SVG is yellow strokes, made for the old
 * dark header) while the pin keeps the brand yellow.
 */
export function Logo({ className = '', markOnly = false }: { className?: string; markOnly?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-slate-900', className)}>
      <svg viewBox="4 0 116 156" className="h-[1.6em] w-auto shrink-0" aria-hidden="true">
        <path d="M58 148 C58 148 4 94 4 58 A54 54 0 1 1 112 58 C112 94 58 148 58 148 Z" fill="var(--color-brand)" />
        <circle cx="58" cy="58" r="37" fill="var(--color-on-brand)" />
        <circle cx="58" cy="58" r="27" fill="var(--color-brand)" />
        <path d="M46 59 L54 67 L70 47" fill="none" stroke="var(--color-on-brand)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!markOnly && (
        <svg viewBox="0 0 272 72" className="h-[0.95em] w-auto" aria-hidden="true">
          <g transform="translate(8 8)" fill="none" stroke="currentColor" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round">
            <path d="M0 0 V56 M42 0 L6 32 M16 25 L44 56" />
            <path d="M72 56 L96 0 L120 56 M81 38 H111" transform="translate(-4 0)" />
            <path d="M142 56 V0 H164 A15 15 0 0 1 164 30 H142 M162 30 L182 56" />
            <path d="M208 0 V36 A21 21 0 0 0 250 36 V0" />
          </g>
        </svg>
      )}
      <span className="sr-only">Karu</span>
    </span>
  );
}
