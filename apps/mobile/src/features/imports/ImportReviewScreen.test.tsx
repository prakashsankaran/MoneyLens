import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ImportReview, ImportRow } from '@moneylens/types';
import { ImportReviewScreen } from './ImportReviewScreen';

const mockCategorize = jest.fn();
const mockRow = (id: string, merchantName: string, amountPaise: number): ImportRow => ({
  id,
  rowIndex: 0,
  date: '2026-10-01T00:00:00.000Z',
  amountPaise,
  type: 'DEBIT',
  flow: 'OUT',
  rawDescription: `UPI ${merchantName.toUpperCase()}`,
  merchantName,
  category: null,
  categoryConfidence: null,
  decision: 'INCLUDE',
  duplicateReason: null,
  warnings: [],
});
const mockReview: ImportReview = {
  import: {
    id: 'imp1',
    filename: 'october.pdf',
    source: 'GOOGLE_PAY',
    parserName: 'gpay@1',
    status: 'READY_FOR_REVIEW',
    createdAt: '2026-10-01T00:00:00.000Z',
    confirmedAt: null,
    statementStart: null,
    statementEnd: null,
    detectedCount: 3,
    duplicateCount: 0,
    committedCount: 0,
    errorMessage: null,
  },
  stats: {
    detected: 3,
    included: 3,
    excluded: 0,
    possibleDuplicates: 0,
    uncategorized: 3,
    firstDate: null,
    lastDate: null,
    totalDebitsPaise: 26_000,
    totalCreditsPaise: 0,
  },
  rows: [
    mockRow('p1', 'Meena Iyer', 6_000),
    mockRow('p2', 'Ravi Kumar', 12_000),
    mockRow('p3', 'Ravi Kumar', 8_000),
  ],
  warnings: [],
};

jest.mock('lucide-react-native', () => ({ Check: () => null, X: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 'imp1' }),
}));
jest.mock('@/lib/queries', () => ({
  useImportReview: () => ({ isPending: false, isError: false, data: mockReview }),
  useUpdateImportRow: () => ({ mutate: jest.fn() }),
  useConfirmImport: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
  useCategorizeImportRows: () => ({ mutate: mockCategorize, isPending: false, isError: false }),
  useCategories: () => ({
    data: [
      {
        id: 'transfers',
        name: 'Transfers',
        slug: 'transfers',
        parentId: null,
        color: null,
        icon: null,
        isSystem: true,
        children: [],
      },
    ],
  }),
}));

describe('ImportReviewScreen', () => {
  it('groups uncategorised rows by merchant and categorises the selected ones', async () => {
    await render(<ImportReviewScreen />);
    await fireEvent.press(screen.getByRole('tab', { name: 'By merchant' }));
    expect(screen.getByText('Ravi Kumar')).toBeTruthy();
    expect(screen.getByText(/2 rows · ₹200 out/)).toBeTruthy();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByText('2 selected · 3 rows')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Set category for 2 selected' }));
    await fireEvent.press(screen.getByText('Transfers'));
    expect(mockCategorize).toHaveBeenCalledWith(
      { rowIds: ['p2', 'p3', 'p1'], categoryId: 'transfers' },
      expect.anything(),
    );
  });
});
