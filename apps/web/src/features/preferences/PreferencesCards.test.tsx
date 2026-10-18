import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Preferences } from '@moneylens/types';
import { categoryTree } from '../../test/fixtures-phase2';
import { mockApi, renderRoute } from '../../test/render';
import { MonthlyEmailCard } from './MonthlyEmailCard';
import { PeopleCategoriesCard } from './PeopleCategoriesCard';

afterEach(() => vi.unstubAllGlobals());

const prefs = (overrides: Partial<Preferences['monthlySummary']> = {}): Preferences => ({
  monthlySummary: {
    available: true,
    enabled: false,
    sendTo: 'aarav@example.test',
    lastSentFor: null,
    ...overrides,
  },
  people: { outCategoryId: null, inCategoryId: null },
});

describe('MonthlyEmailCard', () => {
  it('switches the email on and sends one now', async () => {
    const calls = mockApi(({ method, url }) => {
      if (method === 'PATCH' && url.endsWith('/preferences')) {
        return { data: { preferences: prefs({ enabled: true }), recategorised: 0 } };
      }
      if (url.endsWith('/monthly-summary/send')) {
        return { data: { month: '2026-09', sentTo: 'aarav@example.test' } };
      }
      if (url.endsWith('/preferences')) return { data: prefs() };
      return undefined;
    });
    renderRoute(<MonthlyEmailCard />);
    const toggle = await screen.findByRole('checkbox', {
      name: /Email me a summary when each month ends/,
    });
    await userEvent.click(toggle);
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ monthlySummaryEmail: true });
    expect(await screen.findByRole('checkbox', { checked: true })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: "Send last month's summary now" }));
    expect(
      await screen.findByText(/Sent the September 2026 summary to aarav@example.test/),
    ).toBeInTheDocument();
  });

  it('explains when the server has no email', async () => {
    mockApi(({ url }) =>
      url.endsWith('/preferences') ? { data: prefs({ available: false }) } : undefined,
    );
    renderRoute(<MonthlyEmailCard />);
    expect(
      await screen.findByText(/Email is not set up on this MoneyLens yet/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('PeopleCategoriesCard', () => {
  it('saves the categories and says how many earlier payments were filled in', async () => {
    const calls = mockApi(({ method, url }) => {
      if (url.includes('/categories')) return { data: categoryTree };
      if (method === 'PATCH' && url.endsWith('/preferences')) {
        return {
          data: {
            preferences: { ...prefs(), people: { outCategoryId: 'pets', inCategoryId: null } },
            recategorised: 4,
          },
        };
      }
      if (url.endsWith('/preferences')) return { data: prefs() };
      return undefined;
    });
    renderRoute(<PeopleCategoriesCard />);
    const save = await screen.findByRole('button', { name: 'Save people categories' });
    expect(save).toBeDisabled();
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Money you send to people' }),
      'pets',
    );
    await userEvent.click(save);
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      peopleOutCategoryId: 'pets',
      peopleInCategoryId: null,
    });
    expect(await screen.findByText('Saved. Filled in 4 earlier payments.')).toBeInTheDocument();
  });
});
