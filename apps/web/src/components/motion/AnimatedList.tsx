import { AnimatePresence, motion } from 'motion/react';
import { Children, isValidElement, type ReactNode } from 'react';
import { EASE_SMOOTH_OUT } from '../../lib/motion';

/**
 * When a list changes (a filter, a search, a status update), rows that stay
 * slide to their new place, new rows fade in and removed rows fade out,
 * instead of the whole list snapping. From NourishwithB. Children need
 * stable keys.
 */
export function AnimatedList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <AnimatePresence initial={false} mode="popLayout">
        {Children.toArray(children).map((child) =>
          isValidElement(child) ? (
            <motion.div
              key={child.key}
              layout="position"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3, ease: EASE_SMOOTH_OUT }}
            >
              {child}
            </motion.div>
          ) : (
            child
          ),
        )}
      </AnimatePresence>
    </div>
  );
}
