import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** "side" docks to the right on desktop and becomes a bottom sheet on mobile. */
  variant?: 'center' | 'side';
}

/**
 * Accessible modal: labelled by its title, closes on Escape or backdrop
 * click, moves focus inside on open and restores it on close.
 */
export function Dialog({ title, onClose, children, variant = 'center' }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  const panel =
    variant === 'side'
      ? 'max-h-[92dvh] w-full self-end rounded-t-2xl sm:max-h-dvh sm:h-dvh sm:max-w-md sm:self-stretch sm:rounded-none sm:ml-auto'
      : 'max-h-[92dvh] w-full max-w-lg self-end rounded-t-2xl sm:self-center sm:rounded-2xl';

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-ink-900/40 ${variant === 'center' ? 'sm:p-4' : ''}`}
    >
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex flex-col overflow-hidden bg-surface shadow-xl outline-none ${panel}`}
      >
        <header className="flex items-center justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 rounded-lg p-2 text-ink-500 hover:bg-ink-100"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
