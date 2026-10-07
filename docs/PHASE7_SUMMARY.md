# Phase 7 summary

Date: 2026-10-07. Scope: the React Native mobile app (spec section 23), built
with Expo and sharing the API and packages with the web app. How to run it is
in [apps/mobile/README.md](../apps/mobile/README.md).

## What is implemented

### Mobile app (`apps/mobile`)

- **Expo SDK 57 and Expo Router.** Only modules that run in Expo Go are
  used, so the app can be tried on a phone without a native build.
- **Bottom tabs from the spec:** Home, Transactions, Insights, Plan, More.
  - **Home:** the month stepper, spending with the savings-rate ring, income
    and saved tiles with month-on-month changes, the category donut with a
    ranked list, the six-month income and spending columns, the health score
    summary and the AI Money Brief.
  - **Transactions:** search, money in or out, category and recurring
    filters, infinite scrolling. The detail screen changes the category,
    optionally for all of that merchant's transactions, and saves notes.
    Identifiers are shown masked, as the API returns them.
  - **Insights:** patterns and saving opportunities with "Why?" evidence,
    recurring payments (money coming in is labelled), and the health score
    with each part's working.
  - **Plan:** the money plan with an editable profile form, budgets, and the
    what-if simulator with a stated assumed return.
  - **More:** import a statement, MoneyLens AI, settings, sign out.
- **Import:** the native file picker takes a Google Pay PDF, a bank CSV or an
  Excel file. Password-protected PDFs ask for the password, which is used once
  and not stored. The review screen shows calculated totals, file notes, a
  "Check" filter, and per-row include, leave out, duplicate and category
  (applied to similar rows). Nothing is saved until "Import N transactions".
  Import history can open or delete earlier imports.
- **Files from other apps:** `app.json` registers PDF, CSV and XLSX document
  types and Android intent filters, and `+native-intent.tsx` routes incoming
  `file://` and `content://` URLs to the import screen.
- **MoneyLens AI:** example questions, conversations, and answers that keep
  the AI text (labelled "AI interpretation") apart from the calculated
  figures behind it.
- **Settings:** delete all transactions (typed `DELETE` confirmation) and
  delete the account (password re-check).
- **Design:** colours and type follow [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)
  through `@moneylens/ui`. Big numbers lead each card and charts carry text
  labels, so colour is never the only cue.

### API

- **Mobile sessions:** with `X-MoneyLens-Client: mobile`, register, login and
  refresh return the refresh token in the body, and refresh and logout read
  it from the body. Web clients are unchanged and never see the token. Six
  new tests cover the body token, rotation and reuse, header gating, an empty
  body and logout.

### Shared code

- `packages/shared/src/display.ts` now holds the display helpers both apps
  use: greetings, percentage changes and their tone, savings-rate tone,
  category folding, score tones, insight wording, AI answer notes, text
  blocks and example questions. The web files re-export from it.
- `toRupeeInput()` in `money.ts` formats paise for a form field.

## Verification (run in the build environment)

| Check                                            | Result                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `npm run check` (format, lint, typecheck, tests) | pass, now including the mobile app                                           |
| `npm test`                                       | **495 tests pass**: packages 143, API 299, web 53                            |
| `npm run test:mobile`                            | **23 tests pass**: API client and refresh, file helpers, components, sign-in |
| `npm run test:e2e`                               | **22 pass** (web, desktop and mobile sizes)                                  |
| `npm run build`                                  | pass                                                                         |
| Mobile flows at 390 × 844 (Expo web preview)     | Every screen loads with the demo data and no console errors                  |

Screenshots of the phone screens were taken from the Expo web preview at
phone size.

## Not verified here

- **A physical phone.** This environment has no Android or iOS device or
  simulator. The app was exercised through Expo's web target and unit tests;
  Expo Go on a real phone is the next check.
- **"Open in MoneyLens" from other apps** needs a development build, because
  Expo Go cannot register file types. It is configured but untested.
- `npx expo install` could not reach Expo's servers from this environment, so
  native module versions were taken from `expo/bundledNativeModules.json`,
  which is the list that command uses.

## Technical decisions

- **Expo Go-compatible modules only.** Anyone can open the app from a QR code
  without Xcode or Android Studio.
- **Figures from the API, never the phone.** The app formats numbers but
  calculates none, so mobile and web always agree.
- **A header, not a separate endpoint, for mobile tokens.** The session logic
  stays in one place; only where the token travels differs.
- **One React version.** The workspace is pinned to React 19.2.3, the version
  React Native 0.86 needs, so web and mobile share one copy.

## Known limits

- Mapping unrecognised CSV columns, category management and the monthly
  report are on the web only.
- The browser preview signs you out on reload, because it has no secure
  storage.
