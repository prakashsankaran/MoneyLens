import { describe, expect, it } from 'vitest';
import {
  confidenceLabel,
  describeDevice,
  displayTitle,
  foldCategories,
  formatDayKey,
  greetingFor,
  metricText,
  pctDelta,
  savingsRateTone,
  textBlocks,
  toneForScore,
} from './display';

describe('greetingFor', () => {
  it('uses India Standard Time', () => {
    expect(greetingFor(new Date('2026-10-04T03:00:00Z'))).toBe('Good morning'); // 08:30 IST
    expect(greetingFor(new Date('2026-10-04T08:00:00Z'))).toBe('Good afternoon'); // 13:30 IST
    expect(greetingFor(new Date('2026-10-04T14:00:00Z'))).toBe('Good evening'); // 19:30 IST
    expect(greetingFor(new Date('2026-10-04T18:45:00Z'))).toBe('Good evening'); // 00:15 IST
  });
});

describe('display helpers', () => {
  it('formats a day key in IST', () => {
    expect(formatDayKey('2026-09-05')).toMatch(/5 Sept? 2026/);
  });

  it('labels confidence', () => {
    expect(confidenceLabel(0.85)).toBe('High (85%)');
    expect(confidenceLabel(0.6)).toBe('Medium (60%)');
    expect(confidenceLabel(0.4)).toBe('Low (40%)');
  });

  it('formats an insight metric', () => {
    expect(metricText({ label: 'x', valuePaise: 1234500 })).toBe('₹12,345');
    expect(metricText({ label: 'x', value: 31.456, unit: '%' })).toBe('31.46%');
    expect(metricText({ label: 'x', value: 1.8, unit: 'x' })).toBe('1.8x');
    expect(metricText({ label: 'x' })).toBe('');
  });

  it('moves the saving prefix out of a title', () => {
    expect(displayTitle('Potential saving opportunity: food delivery')).toEqual({
      title: 'Food delivery',
      savingIdea: true,
    });
    expect(displayTitle('Weekend spending')).toEqual({
      title: 'Weekend spending',
      savingIdea: false,
    });
  });

  it('bands a score', () => {
    expect(toneForScore(null)).toBe('none');
    expect(toneForScore(80)).toBe('good');
    expect(toneForScore(60)).toBe('fair');
    expect(toneForScore(10)).toBe('poor');
  });
});

describe('pctDelta', () => {
  it('describes a change and whether it is good news', () => {
    expect(pctDelta(12.4, 'Aug', false)).toEqual({ text: '▲ 12% vs Aug', tone: 'bad' });
    expect(pctDelta(-8, 'Aug', false)).toEqual({ text: '▼ 8% vs Aug', tone: 'good' });
    expect(pctDelta(0.2, 'Aug', true)).toEqual({ text: 'No change vs Aug', tone: 'neutral' });
    expect(pctDelta(null, 'Aug', true)).toBeUndefined();
  });

  it('bands the savings rate', () => {
    expect(savingsRateTone(null)).toBe('none');
    expect(savingsRateTone(25)).toBe('good');
    expect(savingsRateTone(5)).toBe('fair');
    expect(savingsRateTone(-3)).toBe('poor');
  });
});

describe('foldCategories', () => {
  const cat = (name: string, amountPaise: number, sharePct: number) => ({
    categoryId: name,
    name,
    slug: name,
    color: null,
    amountPaise,
    sharePct,
    transactionCount: 1,
  });

  it('folds categories past the limit into one row', () => {
    const rows = foldCategories([cat('a', 500, 50), cat('b', 300, 30), cat('c', 200, 20.04)], 1);
    expect(rows.map((r) => r.name)).toEqual(['a', 'Everything else (2)']);
    expect(rows[1]).toMatchObject({ amountPaise: 500, sharePct: 50, transactionCount: 2 });
  });

  it('leaves a short list alone', () => {
    expect(foldCategories([cat('a', 1, 100)], 6)).toHaveLength(1);
  });
});

describe('textBlocks', () => {
  it('splits paragraphs and lists and drops bold markers', () => {
    expect(textBlocks('**Food** went up.\n\n- Swiggy\n- Zomato')).toEqual([
      { kind: 'paragraph', text: 'Food went up.' },
      { kind: 'list', items: ['Swiggy', 'Zomato'] },
    ]);
  });
});

describe('describeDevice', () => {
  it.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
      'Chrome on Mac',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari on iPhone',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
      'Firefox on Windows',
    ],
    ['okhttp/4.12.0', 'MoneyLens app on Android'],
    ['MoneyLens/1 CFNetwork/1568.100.1 Darwin/24.0.0', 'MoneyLens app on iPhone'],
    ['curl/8.0', 'Unknown device'],
    [null, 'Unknown device'],
  ])('%s → %s', (ua, expected) => {
    expect(describeDevice(ua)).toBe(expected);
  });
});
