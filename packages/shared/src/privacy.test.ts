import { describe, expect, it } from 'vitest';
import { maskTail, maskUpiId } from './privacy';

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
});
