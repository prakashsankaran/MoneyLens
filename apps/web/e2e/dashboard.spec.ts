import { expect, test } from '@playwright/test';

// Requires the API running with demo data: npm run db:seed && npm run dev:api
test('demo user signs in and sees a populated dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@moneylens.app');
  await page.getByLabel('Password').fill('moneylens-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your money in');
  await expect(page.getByRole('region', { name: 'Financial overview' })).toContainText('Income');
  await expect(page.getByRole('heading', { name: /Where did my money go/ })).toBeVisible();
  await expect(page.getByText(/above your \d-month average/).first()).toBeVisible();
});

test('protected pages redirect to sign in', async ({ page }) => {
  await page.goto('/transactions');
  await expect(page).toHaveURL(/\/login$/);
});
