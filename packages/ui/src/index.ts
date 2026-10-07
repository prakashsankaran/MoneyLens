/**
 * Design tokens shared by web (Tailwind theme) and mobile (React Native styles).
 * Keep this file free of DOM or React Native imports.
 */

export const colors = {
  ink: {
    900: '#0f172a',
    700: '#334155',
    500: '#64748b',
    300: '#cbd5e1',
    200: '#e2e8f0',
    100: '#f1f5f9',
    50: '#f8fafc',
  },
  brand: { 700: '#1d4ed8', 600: '#2563eb', 500: '#3b82f6', 100: '#dbeafe', 50: '#eff6ff' },
  positive: '#15803d',
  negative: '#b42318',
  warning: '#b45309',
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

/** Buttons use md (12px, rounded-xl); cards and containers use lg (16px, rounded-2xl). */
export const radii = { sm: 8, md: 12, lg: 16 } as const;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
