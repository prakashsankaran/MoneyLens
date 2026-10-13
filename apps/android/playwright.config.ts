import { defineConfig, devices } from '@playwright/test';

/**
 * Runs the web app's end-to-end tests that need no demo data against the
 * Android build (API inside the page, data in the page's storage), plus this
 * app's own checks in e2e/. Build first: npm run build -w @moneylens/android.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: '..',
  testMatch: [
    'web/e2e/import.spec.ts',
    'web/e2e/google-pay.spec.ts',
    'web/e2e/account-security.spec.ts',
    'android/e2e/*.spec.ts',
  ],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: {
    baseURL: 'http://localhost:4300',
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: 'npx vite preview --config vite.config.ts --port 4300 --strictPort',
    url: 'http://localhost:4300',
    reuseExistingServer: true,
  },
});
