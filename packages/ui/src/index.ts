/**
 * Design tokens shared by web (Tailwind theme) and mobile (React Native styles).
 * Keep this file free of DOM or React Native imports.
 */

export const colors = {
  ink: { 900: '#0f172a', 700: '#334155', 500: '#64748b', 300: '#cbd5e1', 100: '#f1f5f9' },
  brand: { 700: '#0f5c4d', 600: '#13715f', 500: '#178a73', 100: '#dff3ee', 50: '#f0faf7' },
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

export const radii = { sm: 6, md: 10, lg: 16 } as const;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
