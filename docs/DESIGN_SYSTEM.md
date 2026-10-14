# Web design system

The web app is styled with Tailwind CSS 4 utility classes only. Tokens live in
`apps/web/src/index.css` (`@theme`) and mirror `packages/ui` so mobile can share them. The look
follows the "RevLens" style: a cool off-white canvas, white cards with a hairline border and a
soft shadow, very round shapes, the MoneyLens teal-and-emerald brand, and big bold numbers.

## Typography

- Poppins 400/500/600/700 (loaded in `apps/web/index.html`), falling back to the system UI font.
  Bold is capped at 700. Numbers use the same face with tabular figures (set on `body`).
- The type scale is fluid (`clamp()`), growing slightly from phone to desktop: `text-2xs` 11–12px,
  `xs` 12–13, `sm` 13–14, `base` 15–16, `lg` 17–18, `xl` 19–22, `2xl` 23–28, `3xl` 30–40.
- Page titles: `text-2xl font-bold tracking-tight`, with a one-line `text-sm text-ink-500` subtitle.
- Card titles: `text-base font-semibold`; card subtitles `text-xs text-ink-500`.
- Section eyebrows and table headers: small, semibold, uppercase, slightly tracked, `text-ink-500`.

## Colour

- Canvas `bg-canvas` (#F6F8FC), surfaces `bg-surface` (white), borders `border-ink-200` (#E3E8F0).
- Text: `text-ink-900` (#1F2937) for headings and numbers, `ink-700` for body, `ink-500`
  (#64748B) for labels.
- Brand (teal and emerald, from the MoneyLens brand kit): `brand-600` (#0F766E, primary teal) for
  the primary button, active nav and chart emphasis; white on it is 5.5:1, so buttons pass AA.
  `brand-700` (#115E59) for links and small teal text; `brand-50` (#ECFDF5) and `brand-100`
  (#D1FAE5) for active and selected backgrounds. `brand-500` (#10B981, emerald) is the accent:
  logo bars and light chart steps only, never text (it is under 3:1 on white). `brand-900`
  (#063B3A, dark teal) is the app-icon background.
- Status: `positive`, `negative`, `warning`, each with a `-50` tint for pills and callouts.
- Icons sit in neutral grey circles (`bg-ink-100 text-ink-700`), not coloured ones.

## Brand assets

- The mark (an "M" whose right stroke rises into a trend arrow, over two rising bars) is
  `BrandMark` in `apps/web/src/components/Logo.tsx` (mobile: `components/brand.tsx`), drawn from
  `brandMark` in `packages/ui/src/brand.ts` and shaded from `brand-500` to `brand-600`. The
  wordmark beside it stays live text in the app font. The app icon is the same mark in white and
  emerald on a teal-to-dark-teal tile; both are exported to `docs/brand/`.
- Feature icons for Transactions, Budgets, Goals, Reports, Insights, Accounts, Settings and
  Security come from the kit (`featureIcons` in `packages/ui`; `components/BrandIcons.tsx` on web,
  `components/brand.tsx` on mobile). They draw in the current colour like the react-icons line
  set, so other icons keep using `react-icons/lu`.
- App icons, favicons and splash images for web, the Expo app and the Android app are rendered
  from the same artwork by `node scripts/render-brand-icons.mjs`.

## Shape and depth

- Inputs, selects and inner boxes: `rounded-xl` (12px).
- Cards and tiles: `rounded-2xl` (20px), `border-ink-200`, `shadow-card`.
- Dialogs, sheets and the sign-in card: `rounded-3xl` (28px).
- Buttons, chips, segmented controls, nav items, badges and avatars: `rounded-full`.
- Menus, dialogs and hover lift use `shadow-lg` (the larger soft shadow).

## Interaction

- Primary button: `Button` (pill, `bg-brand-600 hover:bg-brand-700`, semibold). Secondary: white
  with a border, `hover:bg-ink-100`. Everything presses to `scale(.98)`.
- Inputs focus with a teal border and a 4px soft teal halo.
- Segmented controls (tabs, ranges): `rounded-full bg-ink-100 p-1`, the active segment white with
  `shadow-card`. Filter chips: `rounded-full border`, selected `bg-brand-50 text-brand-700`.
- Dialogs are bottom sheets on phones (slide up) and centred 28px modals from `sm` (pop in).

## Motion

- House curve `--ease-out: cubic-bezier(.2,.8,.2,1)`.
- `animate-page-enter` on the routed `<main>` (keyed by path): fade in and rise 6px.
- `list-rise` on card grids: children rise in, 30ms apart.
- `animate-pop`, `animate-sheet-up`, `animate-fade-in` for menus, sheets and scrims;
  `<details>` content rises when opened.
- Entry animations use fill mode `backwards`, never `both`: a lingering transform would trap
  fixed-position dialogs inside the animated element.
- `prefers-reduced-motion` turns animation off.

## Icons

React Icons only, from the Lucide set (`react-icons/lu`). Size with `size-4` (inline with
text), `size-5` (navigation and icon buttons) and `size-[18px]` (card header icons).

## Layout

- Shell: a sticky header (wordmark, account menu) on every size; from `md` a sidebar under it
  (72px icon rail, 248px with labels from `lg`); on phones a bottom tab bar with a "More" sheet.
- Pages: `mx-auto max-w-[1200px] px-4 py-5 md:px-6 lg:px-8 lg:py-8`.
- Gaps: `gap-4 lg:gap-6` between cards; `space-y-4 md:space-y-6` between sections.
- Shared building blocks: `Button`, `Card` (optional `icon`), `PageHeader`, `FormField`, `Dialog`
  in `apps/web/src/components`.
- Responsive checks: every screen must fit 320–1440px wide (and phone landscape) with no sideways
  scroll, including crore-sized amounts. Grids that only set columns from a breakpoint also set
  `grid-cols-1` below it (or their items carry `min-w-0`, as `Card` does), so long content cannot
  widen the page. Size tiles of big numbers by their container (`@container`), not the window,
  because the sidebar takes width from `md`.
- iPhone home-screen app: the page uses `viewport-fit=cover`; fixed and sticky bars pad with
  `var(--safe-top|right|bottom|left)` from `index.css`. Fields stay at 16px on touch screens so
  Safari does not zoom in on focus.

## Charts and headline numbers

- Lead with the number that needs attention: the month's spending, each saving idea's monthly
  amount and the health score are the largest text on their cards (`text-2xl` to `text-5xl`,
  `font-bold`). Changes sit beside them as small `h-6` pills: green tint when good, red when not.
- Shared chart pieces live in `apps/web/src/components/charts`: `DonutChart`, `ScoreRing` and
  `chart-theme.ts` (tooltip class, axis ticks, grid colour, `rankColour()`).
- Axes have no lines or ticks; only horizontal grid lines in `chart-grid`. Tooltips are white,
  bordered, 12px radius, `shadow-lg`.
- Trend charts use one teal family: `series-1` (#0F766E, income), `series-2` (#063B3A,
  spending), `series-3` (#6EE7B7), `series-4`. Ranking bars run from mint to full teal by size
  (`rankColour()`).
- Category colours come from `categoryColour()` in `apps/web/src/lib/category-colors.ts`: the
  categorical `chartSeries` palette from `packages/ui` in fixed order for the top six, neutral grey
  after, because one teal family cannot tell many categories apart. Every donut has a labelled
  legend beside it, so colour is never the only cue.
- Rankings (categories, merchants) are horizontal bars; days of the week are columns.
- Long explanations go behind a "Why?" `<details>` toggle.
- Charts must fit a 390px-wide phone without horizontal scrolling.
