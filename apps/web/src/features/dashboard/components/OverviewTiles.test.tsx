import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { dashboardFixture } from '../../../test/fixtures';
import { OverviewTiles } from './OverviewTiles';

describe('OverviewTiles', () => {
  it('shows income, spending, savings and savings rate in rupees', () => {
    render(
      <OverviewTiles totals={dashboardFixture.totals} comparison={dashboardFixture.comparison} />,
    );
    expect(screen.getByText('₹1,45,000')).toBeInTheDocument();
    expect(screen.getByText('₹90,000')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('₹55,000')).toBeInTheDocument();
    expect(screen.getByText('38%')).toBeInTheDocument();
  });

  it('marks a spending increase as unfavourable', () => {
    render(
      <OverviewTiles totals={dashboardFixture.totals} comparison={dashboardFixture.comparison} />,
    );
    const delta = screen.getByText('▲ 12% vs Aug');
    expect(delta).toHaveClass('text-negative');
  });

  it('labels a negative balance as overspent and handles missing income', () => {
    render(
      <OverviewTiles
        totals={{
          ...dashboardFixture.totals,
          incomePaise: 0,
          savedPaise: -9_000_000,
          savingsRatePct: null,
        }}
        comparison={null}
      />,
    );
    expect(screen.getByText('Overspent')).toBeInTheDocument();
    expect(screen.getByText('No income recorded')).toBeInTheDocument();
    expect(screen.queryByText(/vs Aug/)).not.toBeInTheDocument();
  });
});
