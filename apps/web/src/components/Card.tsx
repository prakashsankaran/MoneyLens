import type { ReactNode } from 'react';

interface CardProps {
  /** Phrase the title as the question the card answers. */
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, description, action, children, className = '' }: CardProps) {
  return (
    <section
      className={`rounded-2xl border border-ink-200/70 bg-surface p-5 shadow-card sm:p-7 ${className}`}
    >
      {(title || action) && (
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-base font-semibold tracking-tight text-ink-900 sm:text-lg">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-sm leading-relaxed text-ink-500">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
