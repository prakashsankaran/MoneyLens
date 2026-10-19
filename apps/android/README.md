# MoneyLens for Android (on-device)

An Android app you can share as an `.apk`. It is the MoneyLens web app with
the API running **inside the app**, so each person's account, imported
statements, transactions and analysis stay on their own phone.

## How it keeps data on the phone

- **No server.** `src/backend/local-api.ts` runs the API's own `createApp`
  (apps/api) inside the app's WebView and answers the web app's `/api` calls
  in-process. The same services, import parsers (Google Pay PDF with password,
  CSV, Excel) and analytics run as on the server.
- **On-device database.** `src/backend/prisma` stands in for Prisma and
  Postgres: an in-memory database built from the Prisma schema, saved to the
  app's private storage (IndexedDB) after every change. The API's whole
  integration suite runs against it (`npm test -w @moneylens/android`).
- **One outside address, used only by AI.** The app has Android's internet
  permission so the optional AI (below) can work, but its
  Content-Security-Policy (`connect-src 'self' https://generativelanguage.googleapis.com`)
  blocks every other address, and the font is bundled. Until someone adds a
  key, the app sends nothing at all.
- **No cloud backup.** Android backup and device-to-device transfer are off,
  so the data is not copied to Google Drive.
- **MoneyLens AI is off until the person turns it on.** Without a key it
  answers with the calculated figures only. In Settings, each person can add
  their own free Google Gemini key (stored only on their phone,
  `src/backend/device-ai.ts`); the assistant and the dashboard brief then send
  Gemini the question and that month's calculated figures (totals, category
  totals, top merchant names), and category suggestions during import review
  send the uncategorised merchant names with one masked statement line each
  (no amounts or dates). Statements, transactions, the account and the
  password are never sent. Removing the key turns it off again.

Because nothing is stored elsewhere, uninstalling the app or clearing its
storage deletes the data. Installing a newer version keeps it, as long as the
version is signed with the same key (below).

Server-only pieces are swapped for small equivalents in `src/backend/shims`:
Express routing, multer, argon2 (PBKDF2-SHA256 via Web Crypto), JSON Web
Tokens, node:crypto, pino and the browser builds of pdf.js and read-excel-file.

## Getting the APK

GitHub Actions builds it (`.github/workflows/android.yml`); the Android SDK is
not needed locally.

- Every run uploads **MoneyLens-test.apk** ("MoneyLens test", installs next to
  the real app) as a run artifact.
- On `main`, when the `ANDROID_KEYSTORE_PASSWORD` repository secret is set, it
  also builds **MoneyLens.apk** signed with `release.keystore` and publishes it at
  https://github.com/prakashsankaran/MoneyLens/releases/latest/download/MoneyLens.apk

Keep the keystore password safe: every future version must be signed with
the same key, or phones refuse the update.

## Develop

```bash
npm run build -w @moneylens/android        # web part into apps/android/dist
npx vite preview --config apps/android/vite.config.ts   # try it in a browser
npm test -w @moneylens/android             # on-device DB + the API suite on it
cd apps/android && npx playwright test     # end-to-end in a phone-sized browser
```

After changing `apps/api/prisma/schema.prisma`, run
`npm run generate:schema -w @moneylens/android` (a test fails until you do).
New hand-written SQL in the API needs a handler in `src/backend/prisma/raw.ts`.
