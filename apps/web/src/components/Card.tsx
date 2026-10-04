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
    <section className={`rounded-2xl border border-ink-100 bg-surface p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
