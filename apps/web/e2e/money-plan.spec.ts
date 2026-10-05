import { expect, test, type Page } from '@playwright/test';

// Requires the API running with demo data: npm run db:seed && npm run dev:api
async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@moneylens.app');
  await page.getByLabel('Password').fill('moneylens-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your money in');
}

test('the money plan calculates the surplus and sets budgets from it', async ({ page }) => {
  await signIn(page);
  await page.goto('/plan');
  await expect(page.getByRole('heading', { name: 'Money Plan', level: 1 })).toBeVisible();

  await page.getByLabel(/Monthly income/).fill('145000');
  await page.getByLabel('Savings target').fill('25000');
  await page.getByRole('button', { name: 'Save and calculate' }).click();

  const breakdown = page.getByRole('region', { name: 'Where your income goes' });
  await expect(breakdown.getByText('Available surplus')).toBeVisible();
  await expect(page.getByText(/not professional financial advice/).first()).toBeVisible();

  await page.getByRole('button', { name: /Use these as budgets for/ }).click();
  await expect(page.getByText('Budgets set. See the Budgets tab.')).toBeVisible();

  await page.getByRole('tab', { name: 'Budgets' }).click();
  await expect(page.getByRole('progressbar').first()).toBeVisible();
  await expect(page.getByText('Spent elsewhere')).toBeVisible();
});

test('the what-if simulator projects a change at a stated return', async ({ page }) => {
  await signIn(page);
  await page.goto('/plan');
  await page.getByRole('tab', { name: 'What if?' }).click();
  await page.getByRole('button', { name: 'Reduce food 20%' }).click();
  await page.getByRole('button', { name: 'Save ₹5,000 more' }).click();
  await page.getByRole('button', { name: 'Calculate' }).click();

  await expect(page.getByRole('heading', { name: 'What this would change' })).toBeVisible();
  await expect(page.getByText(/at an assumed 6% a year/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Assumptions' })).toContainText(/not guaranteed/i);
});
