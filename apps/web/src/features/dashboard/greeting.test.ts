import { describe, expect, it } from 'vitest';
import { greetingFor } from './greeting';

describe('greetingFor', () => {
  it('uses India Standard Time', () => {
    expect(greetingFor(new Date('2026-10-04T03:00:00Z'))).toBe('Good morning'); // 08:30 IST
    expect(greetingFor(new Date('2026-10-04T08:00:00Z'))).toBe('Good afternoon'); // 13:30 IST
    expect(greetingFor(new Date('2026-10-04T14:00:00Z'))).toBe('Good evening'); // 19:30 IST
    expect(greetingFor(new Date('2026-10-04T18:45:00Z'))).toBe('Good evening'); // 00:15 IST
  });
});
