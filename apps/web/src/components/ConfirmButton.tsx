import { useEffect, useState, type ComponentType, type ReactNode } from 'react';

/**
 * Two-tap confirmation that replaces window.confirm().
 *
 * Native dialogs are suppressed inside embedded browsers and webviews, where
 * confirm() silently returns false — so a "Cancel booking" button wired
 * through it looks simply dead. First tap arms the button (it shows
 * confirmLabel), second tap fires; it disarms itself if the second tap never
 * comes.
 *
 * `as` receives the design-system Button of the calling screen (there are
 * two), so every extra prop — variant, size, disabled — passes straight
 * through.
 */
export function ConfirmButton({
  as: ButtonComp,
  confirmLabel,
  onConfirm,
  children,
  ...rest
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  as: ComponentType<any>;
  confirmLabel: string;
  onConfirm: () => void;
  children: ReactNode;
  [prop: string]: unknown;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <ButtonComp
      {...rest}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </ButtonComp>
  );
}
