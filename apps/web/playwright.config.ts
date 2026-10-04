import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a running API (with seeded demo data) and the
 * Vite dev server. Start both with `npm run dev` from the repo root, or let
 * Playwright start the web server. Set PLAYWRIGHT_CHROMIUM_PATH to reuse a
 * preinstalled Chromium instead of downloading one.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
