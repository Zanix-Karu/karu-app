import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The car gallery (FEAT-1).
 *
 * Replaces a static hero plus five inert thumbnails. Thumbnails select, arrows
 * step with wrap-around, left/right keys work once the gallery has focus, and
 * a swipe moves one photo.
 *
 * Only the current photo and its immediate neighbours are eager; the rest stay
 * lazy, so a six-photo gallery does not pull six full-size images on a patchy
 * connection.
 */
export function PhotoCarousel({ photos, alt }: { photos: string[]; alt: string }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const count = photos.length;
  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      // Wrap in both directions so the arrows never dead-end.
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  // Arrow keys apply while the gallery holds focus, not globally — the page
  // also has date fields and a booking form that use them.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(index + 1);
    }
  };

  // A new car means a new gallery; do not keep the old position.
  useEffect(() => setIndex(0), [photos.join(',')]);

  if (count === 0) {
    return (
      <div className="flex h-80 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-karu-brown to-karu-ink">
        <span className="font-display text-2xl font-bold tracking-widest text-karu-yellow/80">
          KARU
        </span>
      </div>
    );
  }

  const near = (i: number) => Math.abs(i - index) <= 1 || (index === 0 && i === count - 1);

  return (
    <section aria-roledescription="carousel" aria-label={alt}>
      <div
        ref={frameRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchStartX.current;
          const end = e.changedTouches[0]?.clientX;
          touchStartX.current = null;
          if (start == null || end == null) return;
          const dx = end - start;
          // 40px so a vertical scroll that drifts sideways does not page.
          if (Math.abs(dx) > 40) go(dx < 0 ? index + 1 : index - 1);
        }}
        className="relative h-80 w-full overflow-hidden rounded-2xl bg-karu-brown/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-karu-yellow"
      >
        {photos.map((p, i) => (
          <img
            key={p}
            src={p}
            alt={i === index ? alt : ''}
            aria-hidden={i === index ? undefined : true}
            loading={near(i) ? 'eager' : 'lazy'}
            decoding="async"
            // Cross-fade rather than slide: the neutralised transition under
            // prefers-reduced-motion then reads as a clean cut, not a jump.
            className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-300 ${
              i === index ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ))}

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label={t('gallery.previous')}
              className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-karu-ink/60 text-2xl leading-none text-karu-cream backdrop-blur-sm hover:bg-karu-ink/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-karu-yellow"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label={t('gallery.next')}
              className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-karu-ink/60 text-2xl leading-none text-karu-cream backdrop-blur-sm hover:bg-karu-ink/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-karu-yellow"
            >
              ›
            </button>

            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-karu-ink/60 px-3 py-1.5 backdrop-blur-sm">
              {photos.map((p, i) => (
                <span
                  key={p}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? 'w-4 bg-karu-yellow' : 'w-1.5 bg-karu-cream/50'
                  }`}
                />
              ))}
            </div>

            <p
              aria-live="polite"
              className="absolute right-3 top-3 rounded-full bg-karu-ink/60 px-2.5 py-1 text-xs font-semibold text-karu-cream backdrop-blur-sm"
            >
              {t('gallery.position', { current: index + 1, total: count })}
            </p>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => go(i)}
              aria-label={t('gallery.showPhoto', { n: i + 1 })}
              aria-current={i === index}
              className={`shrink-0 overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-karu-yellow ${
                i === index ? 'ring-2 ring-karu-yellow' : 'opacity-70 hover:opacity-100'
              }`}
            >
              <img src={p} alt="" loading="lazy" decoding="async" className="h-20 w-28 object-cover" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
