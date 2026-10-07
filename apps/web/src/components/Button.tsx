import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const styles: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700 hover:shadow-md hover:shadow-brand-600/25 disabled:bg-ink-300 disabled:shadow-none',
  secondary:
    'border border-ink-200 bg-surface text-ink-900 shadow-card hover:border-ink-300 hover:bg-ink-50 disabled:text-ink-500',
  ghost: 'text-ink-700 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-300',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
