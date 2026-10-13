import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const SAMPLE = fileURLToPath(
  new URL('../../../samples/sample-bank-statement.csv', import.meta.url),
);

// Everything happens inside the app: the page may only load its own files.
let outside: string[] = [];
test.beforeEach(async ({ page }) => {
  outside = [];
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') return route.continue();
    outside.push(url.href);
    return route.abort();
  });
});
test.afterEach(() => {
  expect(outside, 'requests that left the device').toEqual([]);
});

test('an account, its imports and insights stay on the device across restarts', async ({
  page,
}) => {
  await page.goto('/register');
  await page.getByLabel('Name').fill('Asha');
  await page.getByLabel('Email').fill('asha@example.test');
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: /create/i }).click();
  await expect(page.getByText('No transactions yet')).toBeVisible();

  await page.getByRole('link', { name: 'Import a statement' }).click();
  await page.locator('input[type=file]').setInputFiles(SAMPLE);
  await expect(page.getByRole('heading', { name: 'Review import' })).toBeVisible();
  await page.getByRole('button', { name: /Import 27 transactions/ }).click();
  await expect(page.getByText('27 transactions imported')).toBeVisible();

  // Close and reopen the app: still signed in, data still there.
  await page.goto('/');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your money in');
  await expect(page.getByText('No transactions yet')).toHaveCount(0);

  await page.goto('/analytics');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);

  await page.goto('/insights');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);

  // MoneyLens AI answers from the calculated figures, without an AI service.
  await page.goto('/assistant');
  await page
    .getByLabel('Example questions')
    .getByRole('button', { name: 'What are my top 5 merchants?' })
    .click();
  const reply = page.getByRole('listitem', { name: 'MoneyLens AI reply' }).last();
  await expect(reply).toContainText('Calculated');

  // Sign out and back in.
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out on all devices' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email').fill('asha@example.test');
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your money in');
});
