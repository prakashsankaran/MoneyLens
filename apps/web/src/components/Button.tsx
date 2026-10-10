import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const styles: Record<Variant, string> = {
  primary:
    'bg-brand-600 font-semibold text-white hover:bg-brand-700 disabled:bg-ink-300 disabled:text-white',
  secondary:
    'border border-ink-200 bg-surface font-semibold text-ink-900 hover:bg-ink-100 disabled:text-ink-500',
  ghost: 'font-medium text-ink-700 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-300',
};

/** Pill-shaped button. One primary button per area; secondary and ghost for the rest. */
export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
