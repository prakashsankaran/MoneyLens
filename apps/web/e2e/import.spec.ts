import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const SAMPLE = fileURLToPath(
  new URL('../../../samples/sample-bank-statement.csv', import.meta.url),
);

// A fresh account imports the sample statement, reviews it, corrects a
// category, and finally deletes the account.
test('import, review, correct and delete', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E Importer');
  await page
    .getByLabel('Email')
    .fill(`e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: /create/i }).click();
  await expect(page.getByText('No transactions yet')).toBeVisible();

  await page.getByRole('link', { name: 'Import a statement' }).click();
  await page.locator('input[type=file]').setInputFiles(SAMPLE);
  await expect(page.getByRole('heading', { name: 'Review import' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Import summary' })).toContainText('27');

  // Leave out the self transfer, then import the rest.
  await page.getByRole('checkbox', { name: /Import .* on 15 Sept 2026/ }).click();
  await expect(page.getByRole('tab', { name: 'Excluded (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Import 26 transactions' }).click();
  await expect(page.getByText('26 transactions imported')).toBeVisible();

  await page.getByRole('link', { name: 'View transactions' }).click();
  await expect(page.getByText('26 transactions')).toBeVisible();
  await page.getByPlaceholder(/Search merchant/).fill('chai');
  await expect(page.getByText('3 transactions')).toBeVisible();

  // Open the first Chai Point payment and recategorise every one of them.
  await page
    .getByRole('button', { name: /Chai Point/i })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Transaction' });
  await dialog.getByRole('combobox').selectOption({ label: 'Coffee' });
  await dialog.getByRole('checkbox', { name: /every Chai Point transaction/i }).check();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog.getByText(/2 other transactions/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  await page.goto('/settings');
  await page.getByLabel('Your password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
