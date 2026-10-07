import { fireEvent, render, screen } from '@testing-library/react-native';
import type { AssistantAnswer } from '@moneylens/types';
import { AnswerCard } from '@/features/assistant/AnswerCard';
import { Amount } from './Amount';

const answer: AssistantAnswer = {
  status: 'answered',
  month: '2026-09',
  topics: ['change'],
  facts: [
    { kind: 'CALCULATION', text: 'Spending rose 5% from August.' },
  ] as AssistantAnswer['facts'],
  interpretation: 'Food delivery went up the most.\n\n- Swiggy\n- Zomato',
  dataLimitations: ['Only two months of data.'],
  provider: 'test',
  regenerated: false,
};

describe('Amount', () => {
  it('marks money in and money out in words, not only colour', async () => {
    await render(<Amount paise={53500} flow="OUT" />);
    expect(screen.getByLabelText('Paid ₹535.00')).toBeTruthy();
    await render(<Amount paise={14500000} flow="IN" />);
    expect(screen.getByLabelText('Received ₹1,45,000.00')).toBeTruthy();
  });
});

describe('AnswerCard', () => {
  it('labels the AI text and keeps the calculated figures beside it', async () => {
    await render(<AnswerCard content="" answer={answer} />);
    expect(screen.getByText('AI interpretation')).toBeTruthy();
    expect(screen.getByText('• Swiggy')).toBeTruthy();
    expect(screen.getByText('Only two months of data.')).toBeTruthy();
    expect(screen.queryByText('Spending rose 5% from August.')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /figures behind this answer/ }));
    expect(screen.getByText('Calculated')).toBeTruthy();
    expect(screen.getByText('Spending rose 5% from August.')).toBeTruthy();
  });

  it('shows a refusal as plain text', async () => {
    await render(
      <AnswerCard
        content="I can only help with your MoneyLens data."
        answer={{ ...answer, status: 'refused' }}
      />,
    );
    expect(screen.getByText('I can only help with your MoneyLens data.')).toBeTruthy();
    expect(screen.queryByText('AI interpretation')).toBeNull();
  });
});
