import { forwardRef, useId, type InputHTMLAttributes } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  hint?: string;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, hint, className = '', ...props },
  ref,
) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-semibold text-ink-700">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`mt-1.5 block h-12 w-full rounded-xl border bg-surface px-4 text-sm text-ink-900 outline-none transition-all duration-200 placeholder:text-ink-500 hover:border-ink-300 focus:border-brand-600 focus:ring-4 focus:ring-brand-100 ${
          error ? 'border-negative' : 'border-ink-200'
        }`}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-negative">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
