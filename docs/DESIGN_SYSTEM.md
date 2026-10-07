# Web design system

The web app is styled with Tailwind CSS 4 utility classes only. Tokens live in
`apps/web/src/index.css` (`@theme`) and mirror `packages/ui` so mobile can share them.

## Typography

- Inter (loaded in `apps/web/index.html`), falling back to the system UI font.
- Page titles: `text-2xl sm:text-3xl font-bold tracking-tight`.
- Card titles: `text-base sm:text-lg font-semibold tracking-tight`.
- Body and descriptions: `text-sm` (or `sm:text-base`), regular or medium weight,
  `leading-relaxed` for longer copy.

## Colour

- Light mode first: white surfaces (`bg-surface`) on a very light canvas (`bg-canvas`, slate-50).
- Text: `text-ink-900` (slate-900) for primary text, `text-ink-500`/`ink-700` for secondary.
- Accent: `brand-*` is Tailwind's blue scale (`brand-600` = blue-600). Use it only for
  primary actions, active states, links and key highlights.
- Status colours stay semantic: `positive`, `negative`, `warning`.

## Shape and depth

- Buttons and other controls (inputs, selects, tab pills, icon buttons): `rounded-xl` (12px).
- Cards and containers: `rounded-2xl` (16px), `border-ink-200/70`, `shadow-card`.
- Status badges (non-interactive) may stay `rounded-full`.

## Interaction

- Every button, link and input uses `transition-all duration-200` with a visible hover state.
- Primary buttons: `bg-brand-600 hover:bg-brand-700`, a soft blue shadow and `active:scale-[0.98]`.
- Secondary buttons: white with `border-ink-200`, `hover:bg-ink-50 hover:border-ink-300`.
- Inputs focus with `focus:border-brand-600 focus:ring-4 focus:ring-brand-100`.
- Keyboard focus keeps the global `:focus-visible` outline.

## Icons

React Icons only, from the Lucide set (`react-icons/lu`). Size with `size-4` (inline with
text), `size-[18px]` (navigation) or `size-5` (icon buttons), and let them inherit the text colour.

## Layout

- Pages: `mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-12`.
- Columns stack on phones and become grids from `sm:`/`lg:` upward.
- Shared building blocks: `Button`, `Card`, `PageHeader`, `FormField`, `Dialog` in `apps/web/src/components`.

## Charts and headline numbers

- Lead with the number that needs attention: the month's spending, each saving idea's monthly
  amount and the health score are the largest text on their cards (`text-2xl` to `text-5xl`,
  `font-bold`). Changes sit beside them as small pills: green when good, red when not.
- Shared chart pieces live in `apps/web/src/components/charts`: `DonutChart` (part-to-whole,
  total in the hole) and `ScoreRing` (a 0–100 value such as the health score or savings rate).
- Category colours come from `categoryColour()` in `apps/web/src/lib/category-colors.ts`: the
  `chartSeries` palette from `packages/ui` in fixed order for the top six, neutral grey after.
  Every donut has a labelled legend beside it, so colour is never the only cue.
- Rankings (categories, merchants) are horizontal bars; days of the week are columns.
- Long explanations go behind a "Why?" `<details>` toggle.
- Charts must fit a 390px-wide phone without horizontal scrolling.
