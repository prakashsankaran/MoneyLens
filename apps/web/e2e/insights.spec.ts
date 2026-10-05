import { expect, test, type Page } from '@playwright/test';

// Requires the API running with demo data: npm run db:seed && npm run dev:api
async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@moneylens.app');
  await page.getByLabel('Password').fill('moneylens-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your money in');
}

test('insights show their evidence, recurring payments and the health score', async ({ page }) => {
  await signIn(page);
  await page.goto('/insights');
  await expect(page.getByRole('heading', { name: 'Insights', level: 1 })).toBeVisible();

  await page.getByRole('tab', { name: /^Saving/ }).click();
  const first = page.getByRole('article').first();
  await expect(first).toContainText('Potential saving opportunity');
  await first.getByRole('button', { name: /Show the \d+ transactions? behind this/ }).click();
  await expect(first.getByRole('listitem').first()).toBeVisible();

  await page.getByRole('tab', { name: /^Recurring/ }).click();
  await expect(page.getByRole('button', { name: 'Not recurring: Netflix' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'How healthy are my finances?' })).toBeVisible();
  await expect(page.getByText('Savings behaviour')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/waste/i);
});

test('the monthly report has all twelve sections and a comparison month', async ({ page }) => {
  await signIn(page);
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: /^Monthly report:/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(12);
  await expect(page.getByRole('heading', { name: '12. Financial health' })).toBeVisible();
  await page.getByLabel('Compare with').selectOption({ index: 2 });
  await expect(page.getByRole('heading', { name: '2. Income and spending' })).toBeVisible();
});

test('analytics compares the month with earlier periods', async ({ page }) => {
  await signIn(page);
  await page.goto('/analytics');
  await expect(page.getByRole('heading', { name: /How does .* compare\?/ })).toBeVisible();
  await expect(page.getByText('3-month average')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'When do I spend?' })).toBeVisible();
});
