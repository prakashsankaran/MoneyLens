import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { dashboardFixture } from '../../../test/fixtures';
import { SavingsOpportunities } from './SavingsOpportunities';

describe('SavingsOpportunities', () => {
  it('labels each item with its provenance and evidence count', () => {
    render(<SavingsOpportunities observations={dashboardFixture.observations} historyMonths={2} />);
    expect(screen.getByText('Observation')).toBeInTheDocument();
    expect(screen.getByText(/Food Delivery is ₹2,100 above/)).toBeInTheDocument();
    expect(screen.getByText('Based on 3 transactions')).toBeInTheDocument();
  });

  it('explains when there is not enough history to compare', () => {
    render(<SavingsOpportunities observations={[]} historyMonths={1} />);
    expect(screen.getByText(/at least two earlier months/)).toBeInTheDocument();
  });
});
