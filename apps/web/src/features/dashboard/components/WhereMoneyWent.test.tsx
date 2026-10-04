import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { dashboardFixture } from '../../../test/fixtures';
import { WhereMoneyWent } from './WhereMoneyWent';

describe('WhereMoneyWent', () => {
  it('ranks categories and folds the tail into "Everything else"', () => {
    render(<WhereMoneyWent categories={dashboardFixture.categories} />);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(7);
    expect(items[0]).toHaveTextContent('Housing');
    expect(items[6]).toHaveTextContent('Everything else (2)');
    // ₹1,200 + ₹800 folded together.
    expect(items[6]).toHaveTextContent('₹2,000');
  });

  it('shows an empty state', () => {
    render(<WhereMoneyWent categories={[]} />);
    expect(screen.getByText('No spending recorded for this month.')).toBeInTheDocument();
  });
});
