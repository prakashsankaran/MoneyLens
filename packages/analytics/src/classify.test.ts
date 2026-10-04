import { describe, expect, it } from 'vitest';
import { classifyTransaction } from './classify';

describe('classifyTransaction', () => {
  it.each([
    ['DEBIT', 'OUT', 'spend'],
    ['TRANSFER', 'OUT', 'spend'],
    ['CREDIT', 'IN', 'income'],
    ['TRANSFER', 'IN', 'income'],
    ['REFUND', 'IN', 'refund'],
    ['CASHBACK', 'IN', 'cashback'],
    ['SELF_TRANSFER', 'OUT', 'excluded'],
    ['SELF_TRANSFER', 'IN', 'excluded'],
    ['UNKNOWN', 'OUT', 'spend'],
    ['UNKNOWN', 'IN', 'income'],
    // Contradictory type/flow combinations are excluded rather than guessed.
    ['DEBIT', 'IN', 'excluded'],
    ['CREDIT', 'OUT', 'excluded'],
  ] as const)('%s/%s is %s', (type, flow, expected) => {
    expect(classifyTransaction({ type, flow })).toBe(expected);
  });
});
