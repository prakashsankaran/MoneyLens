# MoneyLens mobile (planned, phase 7)

This folder is reserved for the Expo / React Native app. Nothing is implemented
here yet; it is intentionally excluded from the npm workspaces until phase 7 so
that Expo's tooling does not slow down or destabilise the web and API setup.

Planned approach:

- Expo (managed workflow) with TypeScript and Expo Router.
- Reuses `@moneylens/types`, `@moneylens/validation`, `@moneylens/shared` and
  `@moneylens/ui` tokens. No business logic or analytics is reimplemented in the
  app; all figures come from the API.
- Auth: the API returns the refresh token in the response body for mobile
  clients, stored in `expo-secure-store`; the access token stays in memory.
- Native document picker (`expo-document-picker`) and share-sheet import for
  PDF, CSV and XLSX statements.
- Screens: Home, Transactions, Insights, Plan, More (bottom tabs).
