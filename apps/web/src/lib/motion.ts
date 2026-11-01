// Motion presets for the `motion` library, on the same scale as the CSS
// tokens in ds/motion.css (--duration-*, --ease-smooth-out). Ported from
// NourishwithB. Reduced motion is handled globally by <MotionConfig
// reducedMotion="user"> in App.tsx.

export const EASE_SMOOTH_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * For list items wrapped in <AnimatePresence initial={false}>: new rows open
 * into place and removed rows close up, so the list never jumps. The item
 * itself should carry no padding or border (put those on an inner element)
 * so its height can go all the way to zero. It clips itself only while
 * animating, so tooltips and menus inside the row aren't cut off.
 */
export const listItemMotion = {
  layout: true,
  initial: { opacity: 0, height: 0, overflow: 'hidden' },
  animate: { opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } },
  exit: { opacity: 0, height: 0, overflow: 'hidden' },
  transition: { duration: 0.3, ease: EASE_SMOOTH_OUT },
} as const;

/** For rows that stay mounted but move (filtering, re-sorting). */
export const layoutMotion = {
  layout: 'position' as const,
  transition: { duration: 0.3, ease: EASE_SMOOTH_OUT },
};
