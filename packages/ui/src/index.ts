/**
 * Design tokens shared by web (Tailwind theme) and mobile (React Native styles).
 * Keep this file free of DOM or React Native imports.
 */

export const colors = {
  ink: {
    900: '#1f2937',
    700: '#4b5563',
    500: '#64748b',
    300: '#d3dae6',
    200: '#e3e8f0',
    100: '#f1f4f9',
    50: '#f6f8fc',
  },
  /** Teal-and-emerald brand: primary teal 600, emerald accent 500, dark teal for depth. */
  brand: {
    900: '#063b3a',
    800: '#134e4a',
    700: '#115e59',
    600: '#0f766e',
    500: '#10b981',
    100: '#d1fae5',
    50: '#ecfdf5',
  },
  positive: '#15803d',
  negative: '#b91c1c',
  warning: '#a16207',
  tint: { positive: '#e6f6ec', negative: '#feeaea', warning: '#fef3d6' },
} as const;

/**
 * Trend charts (income vs spending, weekdays vs weekends) use one teal family;
 * category charts keep the categorical chartSeries palette below.
 */
export const trendSeries = {
  income: '#0f766e',
  spending: '#063b3a',
  light: '#6ee7b7',
  neutral: '#94a3b8',
} as const;

/**
 * Chart series palette (light and dark steps of the same hues), in fixed
 * slot order. Validated with the dataviz palette validator: slots 1-2 pass
 * adjacent CVD and contrast checks on both chart surfaces.
 * Assign slots by entity (income = 1, spending = 2), never by rank.
 */
export const chartSeries = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
} as const;

/** Chart surfaces the palette was validated against. */
export const chartSurfaces = { light: '#ffffff', dark: '#0f172a' } as const;

/**
 * Inputs and inner items use md (12px), cards lg (20px), sheets and dialogs xl (28px).
 * Buttons, chips, segmented controls and badges are fully round (pill).
 */
export const radii = { sm: 8, md: 12, lg: 20, xl: 28, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export * from './brand';
