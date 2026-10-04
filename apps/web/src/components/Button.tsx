import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const styles: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-600 disabled:bg-ink-300',
  secondary: 'border border-ink-300 bg-surface text-ink-900 hover:bg-ink-100',
  ghost: 'text-ink-700 hover:bg-ink-100',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
