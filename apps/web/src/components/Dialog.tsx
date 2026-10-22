import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Modal dialog, ported from the starter pack. A native <dialog>, so focus is
 * trapped and restored by the browser and Escape closes it; a click on the
 * backdrop closes it too. It fades and rises in, and leaves faster than it
 * arrived (ds/motion.css, .karu-dialog).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons, right-aligned under the content. */
  footer?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
    <dialog
      ref={ref}
      // The browser fires `cancel` on Escape; route it through onClose so the
      // parent's state stays the source of truth.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`karu-dialog m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-karu-ink/10 bg-karu-surface p-6 text-karu-ink shadow-lg sm:p-7 ${className}`}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-bold leading-tight">{title}</h2>
          {description && <p className="mt-2 text-sm text-karu-mute">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="karu-icon-btn -mt-1 -mr-2 shrink-0 text-karu-mute hover:text-karu-ink"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
      {children && <div className="mt-5">{children}</div>}
      {footer && <div className="mt-6 flex flex-wrap items-center justify-end gap-3">{footer}</div>}
    </dialog>
  );
}
