import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { dashboardFixture } from '../../../test/fixtures';
import { savingFixture } from '../../../test/fixtures-phase4';
import { SavingsOpportunities } from './SavingsOpportunities';

describe('SavingsOpportunities', () => {
  it('labels each item with its provenance and evidence count', () => {
    render(
      <MemoryRouter>
        <SavingsOpportunities
          opportunities={[]}
          observations={dashboardFixture.observations}
          historyMonths={2}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Observation')).toBeInTheDocument();
    expect(screen.getByText(/Food Delivery is ₹2,100 above/)).toBeInTheDocument();
    expect(screen.getByText('Based on 3 transactions')).toBeInTheDocument();
  });

  it('explains when there is not enough history to compare', () => {
    render(<SavingsOpportunities opportunities={[]} observations={[]} historyMonths={1} />);
    expect(screen.getByText(/at least two earlier months/)).toBeInTheDocument();
  });
});

describe('SavingsOpportunities with saving estimates', () => {
  it('shows the estimated saving and its assumption first', () => {
    render(
      <MemoryRouter>
        <SavingsOpportunities
          opportunities={[savingFixture]}
          observations={dashboardFixture.observations}
          historyMonths={2}
        />
      </MemoryRouter>,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Potential saving opportunity: 12 food delivery orders');
    expect(items[0]).toHaveTextContent('About ₹2,100 a month');
    expect(items[0]).toHaveTextContent('Bringing food delivery back');
    expect(screen.getByRole('link', { name: /See all insights/ })).toHaveAttribute(
      'href',
      '/insights',
    );
  });
});
