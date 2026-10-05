import { forwardRef, type SelectHTMLAttributes } from 'react';
import type { CategoryNode } from '@moneylens/types';

interface CategorySelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  categories: CategoryNode[];
  /** Label of the empty option, e.g. "Uncategorised" or "All categories". */
  emptyLabel: string;
  /** Extra options rendered after the empty one. */
  extra?: { value: string; label: string }[];
}

/**
 * Native select grouped by top-level category. A top-level category can be
 * chosen on its own ("Food (general)") or via one of its subcategories.
 */
export const CategorySelect = forwardRef<HTMLSelectElement, CategorySelectProps>(
  function CategorySelect({ categories, emptyLabel, extra = [], className = '', ...props }, ref) {
    return (
      <select
        ref={ref}
        className={`h-11 w-full rounded-lg border border-ink-300 bg-surface px-3 text-sm ${className}`}
        {...props}
      >
        <option value="">{emptyLabel}</option>
        {extra.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {categories.map((parent) => (
          <optgroup key={parent.id} label={parent.name}>
            <option value={parent.id}>{parent.name} (general)</option>
            {parent.children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    );
  },
);
