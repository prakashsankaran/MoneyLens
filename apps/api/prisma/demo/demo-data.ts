/**
 * Deterministic generator for realistic Indian demo transactions.
 *
 * All names, UPI handles and references are fictional demo values; no real
 * personal financial information is used. The same seed and end month always
 * produce the same data, so tests and screenshots are reproducible.
 *
 * The story the data tells (so the dashboard has something to explain):
 * - Steady salary, rent, SIP, family transfer and bills.
 * - Food delivery grows month over month (frequency and order size).
 * - Many small coffee/snack payments.
 * - A large one-off electronics purchase and a refund.
 * - Higher electricity bills in summer months.
 */
import { addMonths, istDate, parseMonthKey } from '@moneylens/shared';
import type { PaymentMethod, TransactionFlow, TransactionType } from '@moneylens/types';

export interface DemoMerchant {
  key: string;
  name: string;
  /** Raw strings as they might appear on a statement. */
  aliases: string[];
  /** "parent-slug/child-slug" */
  category: string;
  upiId: string | null;
}

export const DEMO_MERCHANTS: DemoMerchant[] = [
  {
    key: 'employer',
    name: 'Northwind Technologies',
    aliases: ['NORTHWIND TECHNOLOGIES PVT LTD SALARY', 'NEFT-NORTHWIND TECH'],
    category: 'income/salary',
    upiId: null,
  },
  {
    key: 'landlord',
    name: 'Rent (Landlord)',
    aliases: ['UPI-RENT-LANDLORD', 'Rent payment'],
    category: 'housing/rent',
    upiId: 'landlord.demo@okaxis',
  },
  {
    key: 'family',
    name: 'Family (Amma)',
    aliases: ['UPI-AMMA', 'Transfer to Amma'],
    category: 'transfers/family-transfer',
    upiId: 'amma.demo@oksbi',
  },
  {
    key: 'self',
    name: 'Own savings account',
    aliases: ['SELF TRANSFER TO SAVINGS'],
    category: 'transfers/self-transfer',
    upiId: null,
  },
  {
    key: 'groww',
    name: 'Groww',
    aliases: ['GROWW SIP', 'NACH-GROWW MF'],
    category: 'financial/sip',
    upiId: null,
  },
  {
    key: 'lic',
    name: 'LIC',
    aliases: ['LIC PREMIUM', 'LIC OF INDIA'],
    category: 'financial/insurance',
    upiId: null,
  },
  {
    key: 'swiggy',
    name: 'Swiggy',
    aliases: ['SWIGGY', 'Swiggy India', 'SWIGGY*FOOD'],
    category: 'food/food-delivery',
    upiId: 'swiggy.demo@icici',
  },
  {
    key: 'zomato',
    name: 'Zomato',
    aliases: ['ZOMATO', 'Zomato Ltd', 'ZOMATO*ORDER'],
    category: 'food/food-delivery',
    upiId: 'zomato.demo@hdfcbank',
  },
  {
    key: 'thirdwave',
    name: 'Third Wave Coffee',
    aliases: ['THIRD WAVE COFFEE', 'TWC ROASTERS'],
    category: 'food/coffee',
    upiId: 'twc.demo@ybl',
  },
  {
    key: 'chaipoint',
    name: 'Chai Point',
    aliases: ['CHAI POINT', 'CHAIPOINT*BLR'],
    category: 'food/snacks',
    upiId: 'chaipoint.demo@paytm',
  },
  {
    key: 'restaurant',
    name: 'Meghana Foods',
    aliases: ['MEGHANA FOODS', 'Meghana Foods Koramangala'],
    category: 'food/restaurants',
    upiId: 'meghana.demo@okhdfc',
  },
  {
    key: 'dmart',
    name: 'DMart',
    aliases: ['DMART', 'AVENUE SUPERMARTS'],
    category: 'food/groceries',
    upiId: 'dmart.demo@icici',
  },
  {
    key: 'reliance',
    name: 'Reliance Smart',
    aliases: ['RELIANCE SMART', 'RELIANCE RETAIL'],
    category: 'food/groceries',
    upiId: 'reliance.demo@sbi',
  },
  {
    key: 'amazon',
    name: 'Amazon',
    aliases: ['AMAZON', 'AMAZON PAY INDIA', 'AMZN Mktp IN'],
    category: 'shopping/online-shopping',
    upiId: 'amazon.demo@apl',
  },
  {
    key: 'flipkart',
    name: 'Flipkart',
    aliases: ['FLIPKART', 'Flipkart Internet'],
    category: 'shopping/online-shopping',
    upiId: 'flipkart.demo@axl',
  },
  {
    key: 'uber',
    name: 'Uber',
    aliases: ['UBER', 'UBER INDIA*TRIP'],
    category: 'transport/cab',
    upiId: 'uber.demo@icici',
  },
  {
    key: 'ola',
    name: 'Ola',
    aliases: ['OLA', 'ANI TECHNOLOGIES OLA'],
    category: 'transport/cab',
    upiId: 'ola.demo@ybl',
  },
  {
    key: 'fuel',
    name: 'Indian Oil',
    aliases: ['INDIAN OIL', 'IOCL FUEL STN'],
    category: 'transport/fuel',
    upiId: 'iocl.demo@sbi',
  },
  {
    key: 'metro',
    name: 'Namma Metro',
    aliases: ['BMRCL', 'NAMMA METRO RECHARGE'],
    category: 'transport/public-transport',
    upiId: 'bmrcl.demo@icici',
  },
  {
    key: 'airtel',
    name: 'Airtel',
    aliases: ['AIRTEL', 'AIRTEL XSTREAM FIBER'],
    category: 'bills/internet',
    upiId: 'airtel.demo@airtel',
  },
  {
    key: 'jio',
    name: 'Jio',
    aliases: ['JIO', 'RELIANCE JIO PREPAID'],
    category: 'bills/mobile',
    upiId: 'jio.demo@jio',
  },
  {
    key: 'bescom',
    name: 'BESCOM',
    aliases: ['BESCOM', 'BESCOM ELECTRICITY BILL'],
    category: 'bills/electricity',
    upiId: 'bescom.demo@billdesk',
  },
  {
    key: 'bwssb',
    name: 'BWSSB',
    aliases: ['BWSSB WATER'],
    category: 'bills/water',
    upiId: 'bwssb.demo@billdesk',
  },
  {
    key: 'netflix',
    name: 'Netflix',
    aliases: ['NETFLIX', 'NETFLIX.COM'],
    category: 'entertainment/ott',
    upiId: null,
  },
  {
    key: 'spotify',
    name: 'Spotify',
    aliases: ['SPOTIFY', 'SPOTIFY INDIA'],
    category: 'entertainment/ott',
    upiId: null,
  },
  {
    key: 'bookmyshow',
    name: 'BookMyShow',
    aliases: ['BOOKMYSHOW', 'BIGTREE ENTERTAINMENT'],
    category: 'entertainment/movies',
    upiId: 'bms.demo@icici',
  },
  {
    key: 'apollo',
    name: 'Apollo Pharmacy',
    aliases: ['APOLLO PHARMACY', 'APOLLO PHARMA'],
    category: 'healthcare/medicine',
    upiId: 'apollo.demo@okicici',
  },
  {
    key: 'gpay',
    name: 'Google Pay Rewards',
    aliases: ['GOOGLE PAY CASHBACK'],
    category: 'income/other-income',
    upiId: null,
  },
];

export interface DemoTransaction {
  merchantKey: string;
  date: Date;
  amountPaise: number;
  type: TransactionType;
  flow: TransactionFlow;
  description: string;
  paymentMethod: PaymentMethod;
  upiId: string | null;
  reference: string;
}

/** Mulberry32: small, fast, deterministic PRNG. */
function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const rupees = (r: number) => Math.round(r * 100);

export interface GenerateOptions {
  /** Last month to generate, "YYYY-MM". */
  endMonth: string;
  /** Number of months to generate, ending at endMonth. */
  months?: number;
  seed?: number;
}

export function generateDemoTransactions(opts: GenerateOptions): DemoTransaction[] {
  const { endMonth, months = 6, seed = 20260930 } = opts;
  const rng = createRng(seed);
  const merchants = new Map(DEMO_MERCHANTS.map((m) => [m.key, m]));
  const out: DemoTransaction[] = [];
  let refCounter = 400_000_000_000 + (seed % 1_000_000);

  const add = (
    merchantKey: string,
    date: Date,
    amountPaise: number,
    type: TransactionType,
    flow: TransactionFlow,
    paymentMethod: PaymentMethod = 'UPI',
  ) => {
    const m = merchants.get(merchantKey);
    if (!m) throw new Error(`Unknown demo merchant ${merchantKey}`);
    refCounter += rng.int(1, 9_999);
    out.push({
      merchantKey,
      date,
      amountPaise,
      type,
      flow,
      description: rng.pick(m.aliases),
      paymentMethod,
      upiId: paymentMethod === 'UPI' ? m.upiId : null,
      reference: String(refCounter),
    });
  };

  for (let i = 0; i < months; i++) {
    const key = addMonths(endMonth, i - months + 1);
    const { year, month } = parseMonthKey(key);
    const dim = daysInMonth(year, month);
    const at = (day: number, hour = rng.int(8, 22), minute = rng.int(0, 59)) =>
      istDate(year, month, Math.min(day, dim), hour, minute);
    const anyDay = () => at(rng.int(1, dim));
    // 0 for the oldest month, rising to 1 for the latest: drives growth trends.
    const progress = months === 1 ? 1 : i / (months - 1);

    // Fixed monthly inflows and commitments.
    add('employer', at(1, 9, 30), rupees(145_000), 'CREDIT', 'IN', 'NETBANKING');
    add('landlord', at(3), rupees(32_000), 'TRANSFER', 'OUT');
    add('groww', at(5, 10, 0), rupees(10_000), 'DEBIT', 'OUT', 'NETBANKING');
    add('lic', at(7, 11, 0), rupees(2_450), 'DEBIT', 'OUT', 'NETBANKING');
    add('family', at(2), rupees(8_000), 'TRANSFER', 'OUT');
    add('self', at(1, 18, 0), rupees(20_000), 'SELF_TRANSFER', 'OUT', 'NETBANKING');

    // Bills and subscriptions.
    add('airtel', at(10), rupees(999), 'DEBIT', 'OUT');
    add('jio', at(12), rupees(299), 'DEBIT', 'OUT');
    const summer = month >= 4 && month <= 6;
    add(
      'bescom',
      at(15),
      rupees(summer ? rng.int(2_300, 2_900) : rng.int(1_350, 1_800)),
      'DEBIT',
      'OUT',
    );
    add('bwssb', at(18), rupees(rng.int(280, 360)), 'DEBIT', 'OUT');
    add('netflix', at(8, 6, 0), rupees(649), 'DEBIT', 'OUT', 'CARD');
    add('spotify', at(14, 6, 0), rupees(119), 'DEBIT', 'OUT', 'CARD');

    // Food delivery: frequency and basket size grow over the period.
    const deliveries = Math.round(8 + progress * 9) + rng.int(0, 2);
    for (let d = 0; d < deliveries; d++) {
      const day = anyDay();
      add(
        rng.next() < 0.55 ? 'swiggy' : 'zomato',
        day,
        rupees(rng.int(260, 520 + Math.round(progress * 200))),
        'DEBIT',
        'OUT',
      );
    }

    // Small, frequent payments.
    const coffees = rng.int(7, 11);
    for (let c = 0; c < coffees; c++)
      add(
        'thirdwave',
        at(rng.int(1, dim), rng.int(8, 11)),
        rupees(rng.int(190, 320)),
        'DEBIT',
        'OUT',
      );
    const snacks = rng.int(6, 10);
    for (let s = 0; s < snacks; s++)
      add(
        'chaipoint',
        at(rng.int(1, dim), rng.int(15, 18)),
        rupees(rng.int(60, 160)),
        'DEBIT',
        'OUT',
      );

    // Eating out, mostly on weekends.
    const dinners = rng.int(2, 4);
    for (let r = 0; r < dinners; r++)
      add(
        'restaurant',
        at(rng.int(1, dim), rng.int(19, 22)),
        rupees(rng.int(1_200, 3_200)),
        'DEBIT',
        'OUT',
      );

    // Groceries.
    for (let g = 0; g < 3; g++)
      add(
        g === 1 ? 'reliance' : 'dmart',
        at(5 + g * 9 + rng.int(0, 3)),
        rupees(rng.int(1_400, 4_200)),
        'DEBIT',
        'OUT',
      );

    // Online shopping with occasional refunds.
    const orders = rng.int(2, 5);
    for (let o = 0; o < orders; o++)
      add(
        rng.next() < 0.6 ? 'amazon' : 'flipkart',
        anyDay(),
        rupees(rng.int(399, 4_999)),
        'DEBIT',
        'OUT',
      );
    if (i === months - 3) {
      add('flipkart', at(19, 21, 15), rupees(24_999), 'DEBIT', 'OUT', 'CARD');
    }
    if (i === months - 4) {
      add('amazon', at(22), rupees(1_299), 'REFUND', 'IN');
    }

    // Transport.
    const rides = rng.int(6, 12);
    for (let t = 0; t < rides; t++)
      add(rng.next() < 0.6 ? 'uber' : 'ola', anyDay(), rupees(rng.int(140, 620)), 'DEBIT', 'OUT');
    add('fuel', at(rng.int(4, 12)), rupees(rng.int(1_800, 2_400)), 'DEBIT', 'OUT', 'CARD');
    add('fuel', at(rng.int(18, 26)), rupees(rng.int(1_800, 2_400)), 'DEBIT', 'OUT', 'CARD');
    add('metro', at(rng.int(1, 6)), rupees(500), 'DEBIT', 'OUT');

    // Entertainment and health.
    add('bookmyshow', at(rng.int(1, dim), 19), rupees(rng.int(600, 1_300)), 'DEBIT', 'OUT');
    if (rng.next() < 0.6) add('apollo', anyDay(), rupees(rng.int(250, 1_600)), 'DEBIT', 'OUT');

    // Small cashback rewards.
    const cashbacks = rng.int(1, 3);
    for (let k = 0; k < cashbacks; k++)
      add('gpay', anyDay(), rupees(rng.int(5, 75)), 'CASHBACK', 'IN');
  }

  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
