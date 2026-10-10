import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';

interface CardProps {
  /** Phrase the title as the question the card answers. */
  title?: string;
  description?: ReactNode;
  /** Optional icon, shown in a neutral circle beside the title. */
  icon?: IconType;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({
  title,
  description,
  icon: Icon,
  action,
  children,
  className = '',
}: CardProps) {
  return (
    <section
      className={`rounded-2xl border border-ink-200 bg-surface p-4 shadow-card sm:p-5 lg:p-6 ${className}`}
    >
      {(title || action) && (
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-700">
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h2 className="text-base font-semibold leading-tight tracking-tight text-ink-900">
                  {title}
                </h2>
              )}
              {description && <p className="mt-1 text-xs text-ink-500">{description}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
