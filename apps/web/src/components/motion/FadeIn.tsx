import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { EASE_SMOOTH_OUT } from '../../lib/motion';

/** Fades a section up the first time it scrolls into view (from NourishwithB). */
export function FadeIn({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5, delay, ease: EASE_SMOOTH_OUT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
