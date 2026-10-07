import { expect, test, type Page } from '@playwright/test';

// Requires the API running with demo data: npm run db:seed && npm run dev:api.
// Runs against whatever AI_PROVIDER the API has; with none set, the
// assistant must still answer with the calculated figures.
async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@moneylens.app');
  await page.getByLabel('Password').fill('moneylens-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your money in');
}

test('MoneyLens AI answers an example question with labelled figures', async ({ page }) => {
  await signIn(page);
  await page.goto('/assistant');
  await expect(page.getByRole('heading', { name: 'MoneyLens AI', level: 1 })).toBeVisible();
  await page
    .getByLabel('Example questions')
    .getByRole('button', { name: 'What are my top 5 merchants?' })
    .click();

  const reply = page.getByRole('listitem', { name: 'MoneyLens AI reply' }).last();
  await expect(reply).toContainText('Your top merchants in');
  await expect(reply).toContainText('Calculated');
  await expect(page.locator('body')).not.toContainText(/waste/i);
});

test('the dashboard shows the AI Money Brief with its figures', async ({ page }) => {
  await signIn(page);
  const brief = page.locator('section').filter({ hasText: 'AI Money Brief' });
  await expect(brief.getByText(/you received ₹/).first()).toBeVisible();
  await expect(brief.getByRole('link', { name: 'Ask MoneyLens AI a question' })).toBeVisible();
});
