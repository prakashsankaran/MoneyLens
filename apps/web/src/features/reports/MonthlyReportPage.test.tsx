import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportFixture } from '../../test/fixtures-phase4';
import { mockApi, renderRoute } from '../../test/render';
import { MonthlyReportPage } from './MonthlyReportPage';

afterEach(() => vi.unstubAllGlobals());

describe('MonthlyReportPage', () => {
  it('shows all twelve sections with labelled statements', async () => {
    mockApi(({ url }) => (url.includes('/reports/monthly') ? { data: reportFixture } : undefined));
    renderRoute(<MonthlyReportPage />);
    expect(
      await screen.findByRole('heading', { name: 'Monthly report: September 2026' }),
    ).toBeInTheDocument();
    const sections = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(sections).toEqual([
      '1. Summary',
      '2. Income and spending',
      '3. Where the money came from',
      '4. Spending by category',
      '5. Top merchants',
      '6. Recurring payments',
      '7. Biggest payments',
      '8. What changed',
      '9. Habits and unusual payments',
      '10. Potential saving opportunities',
      '11. Suggestions',
      '12. Financial health',
    ]);
    expect(screen.getByText(/you received ₹1,45,000 and spent ₹90,000/)).toBeInTheDocument();
    expect(screen.getByText('Northwind Technologies')).toBeInTheDocument();
    expect(screen.getByText('+₹2,100')).toBeInTheDocument();
    expect(screen.getByText('No category changed much this month.')).toBeInTheDocument();
  });

  it('asks the API for the chosen comparison month', async () => {
    const calls = mockApi(({ url }) =>
      url.includes('/reports/monthly')
        ? {
            data: {
              ...reportFixture,
              availableMonths: ['2026-07', '2026-08', '2026-09'],
              compareMonth: url.includes('compare=2026-07') ? '2026-07' : '2026-08',
            },
          }
        : undefined,
    );
    renderRoute(<MonthlyReportPage />);
    await userEvent.selectOptions(await screen.findByLabelText('Compare with'), '2026-07');
    expect(await screen.findByDisplayValue('July 2026')).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/reports/monthly?compare=2026-07'))).toBe(true);
  });
});
