# Web design system

The web app is styled with Tailwind CSS 4 utility classes only. Tokens live in
`apps/web/src/index.css` (`@theme`) and mirror `packages/ui` so mobile can share them. The look
follows the "RevLens" style: a cool off-white canvas, white cards with a hairline border and a
soft shadow, very round shapes, one electric blue, and big bold numbers.

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
- Text: `text-ink-900` (#111827) for headings and numbers, `ink-700` for body, `ink-500` for labels.
- Accent: `brand-600` (#3874FF) for the primary button, active nav and chart emphasis;
  `brand-700` for links and small blue text (keeps AA contrast on white); `brand-50` for active
  and selected backgrounds.
- Status: `positive`, `negative`, `warning`, each with a `-50` tint for pills and callouts.
- Icons sit in neutral grey circles (`bg-ink-100 text-ink-700`), not coloured ones.

## Shape and depth

- Inputs, selects and inner boxes: `rounded-xl` (12px).
- Cards and tiles: `rounded-2xl` (20px), `border-ink-200`, `shadow-card`.
- Dialogs, sheets and the sign-in card: `rounded-3xl` (28px).
- Buttons, chips, segmented controls, nav items, badges and avatars: `rounded-full`.
- Menus, dialogs and hover lift use `shadow-lg` (the larger soft shadow).

## Interaction

- Primary button: `Button` (pill, `bg-brand-600 hover:bg-brand-700`, semibold). Secondary: white
  with a border, `hover:bg-ink-100`. Everything presses to `scale(.98)`.
- Inputs focus with a blue border and a 4px soft blue halo.
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

## Charts and headline numbers

- Lead with the number that needs attention: the month's spending, each saving idea's monthly
  amount and the health score are the largest text on their cards (`text-2xl` to `text-5xl`,
  `font-bold`). Changes sit beside them as small `h-6` pills: green tint when good, red when not.
- Shared chart pieces live in `apps/web/src/components/charts`: `DonutChart`, `ScoreRing` and
  `chart-theme.ts` (tooltip class, axis ticks, grid colour, `rankColour()`).
- Axes have no lines or ticks; only horizontal grid lines in `chart-grid`. Tooltips are white,
  bordered, 12px radius, `shadow-lg`.
- Trend charts use one blue family: `series-1` (#3874FF, income), `series-2` (#1E3A8A,
  spending), `series-3`, `series-4`. Ranking bars run from light to full blue by size
  (`rankColour()`).
- Category colours come from `categoryColour()` in `apps/web/src/lib/category-colors.ts`: the
  categorical `chartSeries` palette from `packages/ui` in fixed order for the top six, neutral grey
  after, because one blue family cannot tell many categories apart. Every donut has a labelled
  legend beside it, so colour is never the only cue.
- Rankings (categories, merchants) are horizontal bars; days of the week are columns.
- Long explanations go behind a "Why?" `<details>` toggle.
- Charts must fit a 390px-wide phone without horizontal scrolling.
