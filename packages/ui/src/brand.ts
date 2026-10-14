/**
 * MoneyLens brand artwork as plain data (from the teal-and-emerald brand kit),
 * so web (react-icons) and mobile (react-native-svg) draw the same shapes.
 * Everything is on a 100 x 100 grid.
 */

export type BrandShape =
  | { tag: 'path'; attr: { d: string; transform?: string } }
  | { tag: 'circle'; attr: { cx: string; cy: string; r: string } };

/** The rising-bars mark. Strokes and fills name the role, not the colour. */
export const brandMark = {
  line: { d: 'M15 83 V48 Q15 41 22 45 L40 56 Q45 59 50 55 L87 26', strokeWidth: 12 },
  arrow: { d: 'M73 26 L90 22 L87 39', strokeWidth: 9 },
  bars: [
    { d: 'M15 83 V60 L31 69 V83 Z', tone: 'accent' },
    { d: 'M39 83 V68 L55 58 V83 Z', tone: 'primary' },
    { d: 'M63 83 V51 L79 39 V83 Z', tone: 'accent' },
  ],
} as const;

/**
 * Line icons from the brand kit, drawn with a round stroke in the current colour.
 * The kit draws them at stroke 5; in-app they use featureIconStroke so they sit
 * evenly beside the remaining 2px line icons at 18-24px.
 */
export const featureIconStroke = 7;

const path = (d: string, transform?: string): BrandShape => ({
  tag: 'path',
  attr: transform ? { d, transform } : { d },
});
const circle = (cx: number, cy: number, r: number): BrandShape => ({
  tag: 'circle',
  attr: { cx: String(cx), cy: String(cy), r: String(r) },
});

export const featureIcons = {
  transactions: [
    path('M27 16h34l12 12v56H27z'),
    path('M61 16v14h12'),
    path('M37 44h25M37 55h25M37 66h17'),
    path('M36 77l6-5 6 5 6-5 6 5'),
  ],
  budgets: [path('M50 15a35 35 0 1 0 35 35H50z'), path('M58 15v27h27A35 35 0 0 0 58 15z')],
  goals: [
    circle(48, 52, 29),
    circle(48, 52, 17),
    circle(48, 52, 5),
    path('M52 48L81 19M68 19h13v13'),
  ],
  reports: [path('M23 81V58h13v23zM44 81V40h13v41zM65 81V22h13v59z')],
  insights: [
    path('M35 59c0-9-10-12-10-25a25 25 0 0 1 50 0c0 13-10 16-10 25z'),
    path('M37 68h26M40 77h20'),
  ],
  accounts: [
    path('M15 37h70L50 17z'),
    path('M22 42h56M19 80h62M25 46v30M42 46v30M58 46v30M75 46v30'),
  ],
  settings: [
    path(
      'M43 15h14l3 9 7 3 8-4 10 10-4 8 3 7 9 3v14l-9 3-3 7 4 8-10 10-8-4-7 3-3 9H43l-3-9-7-3-8 4-10-10 4-8-3-7-9-3V51l9-3 3-7-4-8 10-10 8 4 7-3z',
      'translate(4,-4) scale(.9)',
    ),
    circle(50, 53, 13),
  ],
  security: [
    path('M50 13l28 10v22c0 19-12 31-28 42C34 76 22 64 22 45V23z'),
    path('M37 49l9 9 18-20'),
  ],
} as const satisfies Record<string, readonly BrandShape[]>;

export type FeatureIconName = keyof typeof featureIcons;
