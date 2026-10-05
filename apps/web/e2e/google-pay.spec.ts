import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const PROTECTED = fileURLToPath(
  new URL('../../api/test/fixtures/gpay-protected.pdf', import.meta.url),
);
const WORKBOOK = fileURLToPath(
  new URL('../../../samples/sample-bank-statement.xlsx', import.meta.url),
);

// A fresh account opens a password-protected Google Pay statement, imports
// it, imports an Excel bank statement, renames a merchant and leaves.
test('google pay pdf with password, excel import, merchant rename', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E Google Pay');
  await page
    .getByLabel('Email')
    .fill(`e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: /create/i }).click();
  await expect(page.getByText('No transactions yet')).toBeVisible();

  await page.goto('/imports');
  await page.locator('input[type=file]').setInputFiles(PROTECTED);
  const dialog = page.getByRole('dialog', { name: 'This PDF is password protected' });
  await dialog.getByLabel('PDF password').fill('not-it');
  await dialog.getByRole('button', { name: 'Open PDF' }).click();
  await expect(dialog.getByText(/did not open the PDF/)).toBeVisible();
  await dialog.getByLabel('PDF password').fill('ASHA0101');
  await dialog.getByRole('button', { name: 'Open PDF' }).click();

  await expect(page.getByRole('heading', { name: 'Review import' })).toBeVisible();
  await expect(page.getByText('Arjun Mehta', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Import 2 transactions' }).click();
  await expect(page.getByText('2 transactions imported')).toBeVisible();

  await page.goto('/imports');
  await page.locator('input[type=file]').setInputFiles(WORKBOOK);
  await expect(page.getByRole('heading', { name: 'Review import' })).toBeVisible();
  await expect(page.getByText('Read the sheet "Transactions".')).toBeVisible();
  // The bank's Swiggy row carries the same UPI reference as the Google Pay one.
  await expect(page.getByText(/Possible duplicate: Same reference number/)).toBeVisible();
  await page.getByRole('button', { name: 'Import 2 transactions' }).click();
  await expect(page.getByText('2 transactions imported')).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Rename Arjun Mehta' }).click();
  await page.getByLabel('New name for Arjun Mehta').fill('Arjun (flatmate)');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Arjun (flatmate)')).toBeVisible();

  await page.getByLabel('Your password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
