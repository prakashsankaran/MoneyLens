import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const SAMPLE = fileURLToPath(
  new URL('../../../samples/sample-bank-statement.csv', import.meta.url),
);

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

// Everything happens inside the app: the page may only load its own files,
// plus Gemini once the person has turned AI on (answered here by a stand-in).
let outside: string[] = [];
let geminiBodies: string[] = [];
test.beforeEach(async ({ page }) => {
  outside = [];
  geminiBodies = [];
  await page.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'localhost') return route.continue();
    outside.push(url.href);
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
    };
    if (url.href === GEMINI && request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: cors });
    }
    if (url.href === GEMINI && request.method() === 'POST') {
      geminiBodies.push(request.postData() ?? '');
      return route.fulfill({
        headers: cors,
        json: {
          choices: [
            { message: { content: 'Most of your spending went to a handful of merchants.' } },
          ],
        },
      });
    }
    return route.abort();
  });
});

async function createAccountWithSample(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Name').fill('Asha');
  await page.getByLabel('Email').fill('asha@example.test');
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: /create/i }).click();
  // New accounts are shown their recovery key once before the app opens.
  await expect(page.getByText('Save your recovery key')).toBeVisible();
  await page.getByLabel('I have saved my recovery key').check();
  await page.getByRole('button', { name: 'Open MoneyLens' }).click();
  await expect(page.getByText('No transactions yet')).toBeVisible();

  await page.getByRole('link', { name: 'Import a statement' }).click();
  await page.locator('input[type=file]').setInputFiles(SAMPLE);
  await expect(page.getByRole('heading', { name: 'Review import' })).toBeVisible();
  await page.getByRole('button', { name: /Import 27 transactions/ }).click();
  await expect(page.getByText('27 transactions imported')).toBeVisible();
}

async function askTopMerchants(page: Page) {
  await page.goto('/assistant');
  await page
    .getByLabel('Example questions')
    .getByRole('button', { name: 'What are my top 5 merchants?' })
    .click();
  return page.getByRole('listitem', { name: 'MoneyLens AI reply' }).last();
}

test('an account, its imports and insights stay on the device across restarts', async ({
  page,
}) => {
  await createAccountWithSample(page);

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

  // AI is off until a key is added: calculated figures only.
  const reply = await askTopMerchants(page);
  await expect(reply).toContainText('Calculated');
  await expect(page.getByText('MoneyLens AI is off on this phone')).toBeVisible();

  // Sign out and back in.
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out on all devices' }).click();
  await expect(page).toHaveURL(/\/login/);
  // The version is shown on the sign-in page, so friends can say which one they have.
  await expect(page.getByText(/^MoneyLens for Android 1\.0\.\d+$/)).toBeVisible();
  await page.getByLabel('Email').fill('asha@example.test');
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your money in');

  expect(outside, 'requests that left the device').toEqual([]);
});

test('with their own key, only the question and calculated figures go to Gemini', async ({
  page,
}) => {
  await createAccountWithSample(page);
  // Load the dashboard before AI is on: nothing leaves the phone.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your money in');
  expect(outside).toEqual([]);

  await page.goto('/settings');
  await page.getByLabel('Google Gemini API key').fill('test-key-123');
  await page.getByRole('button', { name: 'Turn on AI' }).click();
  await expect(page.getByText('Written answers and category suggestions are on')).toBeVisible();

  const reply = await askTopMerchants(page);
  await expect(reply).toContainText('Most of your spending went to a handful of merchants.');
  await expect(reply).toContainText('AI interpretation');

  expect(new Set(outside)).toEqual(new Set([GEMINI]));
  const sent = geminiBodies.join('\n');
  expect(sent).toContain('top 5 merchants');
  for (const secret of ['asha@example.test', 'correct horse battery', 'sample-bank-statement']) {
    expect(sent).not.toContain(secret);
  }

  // Turning it off stops the requests.
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Remove key and turn AI off' }).click();
  const count = outside.length;
  await expect(await askTopMerchants(page)).toContainText('Calculated');
  expect(outside).toHaveLength(count);
});
