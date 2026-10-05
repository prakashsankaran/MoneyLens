import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { categoryTree } from '../../test/fixtures-phase2';
import {
  budgetsFixture,
  emptyPlanFixture,
  planFixture,
  simulationFixture,
} from '../../test/fixtures-phase5';
import { mockApi, renderRoute } from '../../test/render';
import { MoneyPlanPage } from './MoneyPlanPage';

afterEach(() => vi.unstubAllGlobals());

const shoppingTree = [
  ...categoryTree,
  { ...categoryTree[1]!, id: 'shopping', name: 'Shopping', slug: 'shopping', isSystem: true },
];

describe('MoneyPlanPage', () => {
  it('asks for income first, then saves the figures and shows the calculated plan', async () => {
    const calls = mockApi(({ method, url }) => {
      if (url.endsWith('/money-plan') && method === 'GET') return { data: emptyPlanFixture };
      if (url.endsWith('/money-plan') && method === 'POST') return { data: planFixture };
      return undefined;
    });
    renderRoute(<MoneyPlanPage />);
    expect(
      await screen.findByText('Enter your monthly income to see the plan'),
    ).toBeInTheDocument();
    expect(screen.getByText(/not professional financial advice/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Monthly income/), '145000');
    await userEvent.type(screen.getByLabelText('Savings target'), '25000');
    await userEvent.click(screen.getByRole('button', { name: 'Save and calculate' }));

    expect(await screen.findByText('Your goals fit within your income')).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/money-plan'));
    expect(post?.body).toMatchObject({ monthlyIncome: '145000', savingsTarget: '25000' });

    const table = screen.getByRole('region', { name: 'Where your income goes' });
    expect(within(table).getByText('Available surplus')).toBeInTheDocument();
    expect(within(table).getAllByText('Calculated').length).toBeGreaterThan(0);
    expect(screen.getByText(/About ₹11,894 a month is left/)).toBeInTheDocument();
    expect(screen.getAllByText('Suggestion').length).toBeGreaterThan(0);
  });

  it('turns suggested budgets into budgets for the current month', async () => {
    const calls = mockApi(({ method, url }) => {
      if (url.endsWith('/money-plan')) return { data: planFixture };
      if (method === 'PUT') return { data: budgetsFixture };
      return undefined;
    });
    renderRoute(<MoneyPlanPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Use these as budgets/ }));
    expect(await screen.findByText('Budgets set. See the Budgets tab.')).toBeInTheDocument();
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toMatch(/\/budgets\/\d{4}-\d{2}$/);
    expect(put?.body).toEqual({ items: [{ categoryId: 'food-delivery', amount: '6000' }] });
  });

  it('shows budget progress and changes or removes a budget', async () => {
    const calls = mockApi(({ url }) => {
      if (url.includes('/budgets')) return { data: budgetsFixture };
      if (url.endsWith('/categories')) return { data: categoryTree };
      return undefined;
    });
    renderRoute(<MoneyPlanPage />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Budgets' }));

    expect(await screen.findByText('Near the limit')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Food Delivery budget used' })).toHaveAttribute(
      'aria-valuenow',
      '90',
    );
    expect(screen.getByText(/about ₹27,900 by month end/)).toBeInTheDocument();
    expect(screen.getByText('₹1,200')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Change Food Delivery budget' }));
    const input = screen.getByLabelText(/New budget for Food Delivery/);
    await userEvent.clear(input);
    await userEvent.type(input, '7000');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Food Delivery budget' }));

    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts.map((c) => c.body)).toEqual([
      { items: [{ categoryId: 'food-delivery', amount: '7000' }] },
      { items: [{ categoryId: 'food-delivery', amount: null }] },
    ]);
    expect(puts[0]?.url).toMatch(/\/budgets\/2026-10$/);
  });

  it('runs a what-if preset with a stated, non-guaranteed return', async () => {
    const calls = mockApi(({ url }) => {
      if (url.endsWith('/categories')) return { data: shoppingTree };
      if (url.endsWith('/money-plan/simulate')) return { data: simulationFixture };
      return undefined;
    });
    renderRoute(<MoneyPlanPage />);
    await userEvent.click(await screen.findByRole('tab', { name: 'What if?' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Reduce food 20%' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reduce shopping ₹3,000' }));
    expect(screen.getByText(/Returns are not guaranteed/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Calculate' }));

    expect(await screen.findByText('+₹1,800')).toBeInTheDocument();
    expect(screen.getByText('+₹21,600')).toBeInTheDocument();
    expect(screen.getByText(/at an assumed 6% a year/)).toBeInTheDocument();
    expect(screen.getByText('Returns are an assumption, not a guarantee.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/simulate'))?.body).toEqual({
      adjustments: [
        { type: 'category-percent', categoryId: 'food', percent: '20' },
        { type: 'category-amount', categoryId: 'shopping', amount: '3000' },
      ],
      annualReturnPct: '6',
    });
  });

  it('shows which change is invalid', async () => {
    mockApi(({ url }) => {
      if (url.endsWith('/categories')) return { data: categoryTree };
      if (url.endsWith('/simulate')) {
        return {
          status: 400,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Some fields are invalid',
            details: { fields: { 'adjustments.0.amount': 'Enter an amount' } },
          },
        };
      }
      return undefined;
    });
    renderRoute(<MoneyPlanPage />);
    await userEvent.click(await screen.findByRole('tab', { name: 'What if?' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add a change' }));
    await userEvent.click(screen.getByRole('button', { name: 'Calculate' }));
    expect(await screen.findByText('Change 1: Enter an amount')).toBeInTheDocument();
  });
});
