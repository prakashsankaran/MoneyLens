import { describe, expect, it } from 'vitest';
import { maskIdentifiersInText, maskTail, maskUpiId } from './privacy';

describe('masking', () => {
  it('masks the UPI handle but keeps the bank suffix', () => {
    expect(maskUpiId('rahul.sharma@okaxis')).toBe('ra••••••••••@okaxis');
    expect(maskUpiId('ab@ybl')).toBe('ab•••@ybl');
    expect(maskUpiId(null)).toBeNull();
  });

  it('keeps only the tail of references', () => {
    expect(maskTail('426789123456')).toBe('••••3456');
    expect(maskTail('123')).toBe('•••');
  });

  it('masks UPI IDs and long numbers inside narrations', () => {
    expect(
      maskIdentifiersInText('UPI-SWIGGY-swiggy.demo@icici-ICIC0000001-424698765432-PAYMENT'),
    ).toBe('UPI-SWIGGY-sw•••••••••@icici-ICIC0000001-••••5432-PAYMENT');
    expect(maskIdentifiersInText('POS 4321XXXXXXXX9876 STARBUCKS')).toBe('POS ••••9876 STARBUCKS');
    expect(maskIdentifiersInText('Paid to john.doe@example.com')).toBe(
      'Paid to jo••••••@example.com',
    );
    expect(maskIdentifiersInText('Zomato order 5521')).toBe('Zomato order 5521');
    expect(maskIdentifiersInText(null)).toBeNull();
  });
});
