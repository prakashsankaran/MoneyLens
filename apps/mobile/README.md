# MoneyLens mobile

The MoneyLens app for Android and iOS, built with Expo (SDK 57) and Expo
Router. It talks to the same API as the web app and shows the same figures:
nothing is calculated on the phone except formatting.

## What it does

| Tab          | What you can do                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| Home         | The month's spending, income and savings rate, where the money went, the six-month trend, the AI brief |
| Transactions | Search and filter, open a transaction, change its category (and teach it for that merchant), add notes |
| Insights     | Patterns and saving opportunities with their evidence, recurring payments, the financial health score  |
| Plan         | Your monthly numbers and the money plan, budgets, and the what-if simulator                            |
| More         | Import a statement, MoneyLens AI, settings (password, sign-in activity, data deletion), sign out       |

Statements are imported with the phone's file picker: a Google Pay PDF
(password-protected ones too), a bank CSV, or an Excel `.xlsx` file. You
review every row before anything is saved, exactly as on the web. A CSV whose
columns MoneyLens cannot recognise has to be mapped once on the web.

## Run it on your phone with Expo Go

You need the API running on your computer (see the main README) and the
Expo Go app on your phone. Phone and computer must be on the same Wi-Fi.

```bash
npm install                 # from the repository root, once
npm run dev:api             # API on port 4000
npm run dev:mobile          # Expo dev server; prints a QR code
```

Scan the QR code with the camera (iOS) or from Expo Go (Android). The app
finds the API on the same computer that served the app, on port 4000, so no
configuration is needed on a home network.

If your network blocks phone-to-computer traffic, or the API runs somewhere
else, set the address explicitly before starting Expo:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000/api npm run dev:mobile
```

Sign in with the demo user (`demo@moneylens.app` / `moneylens-demo`) or your
own account.

### Preview in a browser

`npm run web -w @moneylens/mobile` opens the app at `http://localhost:8081`.
Add that origin to the API's `CORS_ORIGINS`
(`CORS_ORIGINS=http://localhost:5173,http://localhost:8081`). The browser
preview has no secure storage, so a page reload signs you out.

## Sign-in and secrets

- The app sends `X-MoneyLens-Client: mobile` with every request. For such
  clients the API returns the refresh token in the response body instead of a
  cookie.
- The refresh token is stored with `expo-secure-store` (iOS Keychain, Android
  Keystore). The access token is only kept in memory.
- Signing out revokes the session on the server and deletes the stored token,
  even when the API cannot be reached.
- The app never asks for a UPI PIN, bank password, card CVV or OTP. A PDF
  password is sent once with the upload and is not stored anywhere.

## Opening statements from other apps

`app.json` registers MoneyLens for PDF, CSV and XLSX files (iOS document
types, Android `VIEW` intent filters), and `src/app/+native-intent.tsx`
sends an incoming `file://` or `content://` URL to the import screen. This
needs a development or store build: Expo Go cannot register file types, so
in Expo Go use **More → Import a statement** instead.

## Layout

```
src/app/          Routes (Expo Router): sign-in, register, (tabs)/, imports/, transaction/[id], assistant, settings
src/features/     Screens by feature: home, transactions, insights, plan, imports, assistant, settings, auth
src/components/   Shared UI (cards, buttons, fields, badges) and charts (donut, rings, bars)
src/lib/          API client with token refresh, React Query hooks, secure token store, theme, API address
```

Colours, radii and type come from `@moneylens/ui`; formatting, greetings and
labels come from `@moneylens/shared`, the same code the web app uses.

## Checks

```bash
npm run typecheck -w @moneylens/mobile
npm run test:mobile          # Jest (jest-expo) + React Native Testing Library
npm run lint                 # ESLint covers the app with the rest of the repo
```

## Known limits

- Tested in the browser preview at phone size and with unit tests. It has not
  yet been run on a physical device in this repository's CI.
- "Open in MoneyLens" from other apps needs a development build (see above).
- Mapping unrecognised CSV columns, category management and the monthly
  report are web-only for now.
- On Android, release builds block plain `http://` by default; a deployed API
  should use HTTPS.
