import { expect, test } from '@playwright/test';

// A fresh account changes its password, sees the activity, and signs out
// everywhere.
test('password change, sign-in activity and sign out on all devices', async ({ page }) => {
  const email = `e2e-sec-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E Security');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: /create/i }).click();
  // New accounts are shown their recovery key once before the app opens.
  await expect(page.getByText('Save your recovery key')).toBeVisible();
  await page.getByLabel('I have saved my recovery key').check();
  await page.getByRole('button', { name: 'Open MoneyLens' }).click();
  await expect(page.getByText('No transactions yet')).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByText('Account created')).toBeVisible();

  await page.getByLabel('Current password').fill('correct horse battery');
  await page.getByLabel('New password').fill('a brand new passphrase');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(
    page.getByText('Password changed. Other devices have been signed out.'),
  ).toBeVisible();

  // The old password no longer works; the new one does.
  await page.getByRole('button', { name: 'Sign out on all devices' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('alert')).toContainText(/incorrect/i);
  await page.getByLabel('Password').fill('a brand new passphrase');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText('No transactions yet')).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Recent sign-in activity' })).toBeVisible();
  const activity = page.locator('section', { hasText: 'Recent sign-in activity' });
  await expect(activity.getByText('Wrong password entered')).toBeVisible();
  await expect(activity.getByText('Signed out on every device')).toBeVisible();
  await expect(activity.getByText('Password changed, other devices signed out')).toBeVisible();
});

test('forgot password: reset with the recovery key from sign-up', async ({ page }) => {
  const email = `e2e-key-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E Recovery');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: /create/i }).click();
  const key = (await page.getByTestId('recovery-key').textContent()) ?? '';
  await page.getByLabel('I have saved my recovery key').check();
  await page.getByRole('button', { name: 'Open MoneyLens' }).click();
  await expect(page.getByText('No transactions yet')).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Recovery key').fill(key.toLowerCase());
  await page.getByLabel('New password').fill('a brand new passphrase');
  await page.getByRole('button', { name: 'Set new password' }).click();

  // The key is used up, so a new one is shown before the app opens.
  await expect(page.getByText('Password changed')).toBeVisible();
  await expect(page.getByTestId('recovery-key')).not.toHaveText(key);
  await page.getByLabel('I have saved my recovery key').check();
  await page.getByRole('button', { name: 'Open MoneyLens' }).click();
  await expect(page.getByText('No transactions yet')).toBeVisible();
});
