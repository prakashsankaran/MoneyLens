/**
 * Merchant normalisation: turn raw statement narrations such as
 * "UPI/412345678901/SWIGGY/swiggy@icici/Payment" or "POS 4321XXXX SWIGGY*FOOD"
 * into a stable merchant key ("SWIGGY") and a display name ("Swiggy").
 */

const STOP_SEGMENTS = new Set([
  'UPI',
  'NEFT',
  'IMPS',
  'RTGS',
  'POS',
  'ATM',
  'ACH',
  'NACH',
  'ECS',
  'MMT',
  'BIL',
  'ONL',
  'ECOM',
  'PAY',
  'PAYMENT',
  'PAYMENTS',
  'PAYMENT FROM PHONE',
  'PAID VIA',
  'SENT USING PAYTM UPI',
  'TO',
  'FROM',
  'DR',
  'CR',
  'TXN',
  'REF',
  'INR',
  'NA',
  'NULL',
  'NONE',
  'COLLECT',
  'P2M',
  'P2A',
  'MANDATE',
  'PURCHASE',
  'DEBIT CARD',
  'CREDIT CARD',
  'VPS',
  'IPS',
  'INB',
  'MB',
  'NET BANKING',
  'UPI LITE',
  'OTHERS',
  'OK',
]);

// Trailing words that do not distinguish one merchant from another.
const LEGAL_SUFFIXES =
  /(\s(PRIVATE LIMITED|PVT LTD|PVT|LTD|LIMITED|LLP|INC|CORPORATION|CORP|INDIA|IN|TECHNOLOGIES|TECHNOLOGY|INTERNET|ONLINE|SERVICES|RETAIL|DOT COM|COM))+$/;

function isNoise(segment: string): boolean {
  const s = segment.trim();
  if (s.length < 2) return true;
  if (STOP_SEGMENTS.has(s)) return true;
  if (/@/.test(s)) return true; // UPI handle
  if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(s)) return true; // IFSC code
  if (/^[\dX*]+$/.test(s)) return true; // references, masked card numbers
  const digits = s.replace(/\D/g, '').length;
  return digits / s.length > 0.5;
}

/** Best-guess merchant text from a raw narration, uppercased. */
export function extractMerchantText(description: string): string {
  const upper = description.toUpperCase().replace(/\s+/g, ' ').trim();
  const segments = upper
    .split(/[/|*\\]|\s-\s|-(?=\S)|:/)
    .map((s) =>
      s
        .trim()
        .replace(/^(UPI|POS|NEFT|IMPS|RTGS|ACH|NACH|ECS)\s+/, '')
        // Wallet wording such as Google Pay's "Paid to Swiggy".
        .replace(/^(PAID TO|RECEIVED FROM|SENT TO|PAYMENT TO|PAYMENT FROM|MONEY SENT TO)\s+/, '')
        .trim(),
    )
    .filter((s) => !isNoise(s));
  const candidate = segments[0] ?? upper;
  // Drop trailing reference-like tokens inside the chosen segment.
  return candidate
    .split(' ')
    .filter((token) => !/^[\dX*]{4,}$/.test(token))
    .join(' ')
    .trim();
}

/** Stable key used to match aliases: uppercase letters/digits, no legal suffixes. */
export function merchantKey(text: string): string {
  const cleaned = text
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stripped = cleaned.replace(LEGAL_SUFFIXES, '').trim();
  return stripped || cleaned;
}

/** "MEGHANA FOODS KORAMANGALA" -> "Meghana Foods Koramangala". */
export function toDisplayName(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

export interface KnownMerchant {
  name: string;
  /** Keys (as produced by `merchantKey`) or leading words that identify it. */
  patterns: RegExp;
  /** "parent-slug/child-slug" */
  category: string;
}

/**
 * Well-known Indian merchants. Matching is on the normalised key so
 * "SWIGGY*FOOD", "Swiggy India" and "SWIGGY INSTAMART" all resolve.
 */
export const KNOWN_MERCHANTS: KnownMerchant[] = [
  { name: 'Swiggy', patterns: /\b(SWIGGY|BUNDL)\b/, category: 'food/food-delivery' },
  { name: 'Zomato', patterns: /\bZOMATO\b/, category: 'food/food-delivery' },
  { name: 'Blinkit', patterns: /\b(BLINKIT|GROFERS)\b/, category: 'food/groceries' },
  { name: 'Zepto', patterns: /\bZEPTO\b/, category: 'food/groceries' },
  {
    name: 'BigBasket',
    patterns: /\b(BIGBASKET|BIG BASKET|SUPERMARKET GROCERY SUPPLIES)\b/,
    category: 'food/groceries',
  },
  { name: 'DMart', patterns: /\b(DMART|D MART|AVENUE SUPERMARTS)\b/, category: 'food/groceries' },
  { name: 'Reliance Digital', patterns: /\bRELIANCE DIGITAL\b/, category: 'shopping/electronics' },
  {
    name: 'Reliance Smart',
    patterns: /\bRELIANCE (SMART|FRESH|RETAIL|MART)\b/,
    category: 'food/groceries',
  },
  { name: 'Amazon', patterns: /\b(AMAZON|AMZN)\b/, category: 'shopping/online-shopping' },
  { name: 'Flipkart', patterns: /\bFLIPKART\b/, category: 'shopping/online-shopping' },
  { name: 'Myntra', patterns: /\bMYNTRA\b/, category: 'shopping/clothing' },
  { name: 'Ajio', patterns: /\bAJIO\b/, category: 'shopping/clothing' },
  { name: 'Nykaa', patterns: /\bNYKAA\b/, category: 'shopping/online-shopping' },
  { name: 'Croma', patterns: /\bCROMA\b/, category: 'shopping/electronics' },
  { name: 'Uber', patterns: /\bUBER\b/, category: 'transport/cab' },
  { name: 'Ola', patterns: /\b(OLA|OLACABS|ANI TECHNOLOGIES)\b/, category: 'transport/cab' },
  { name: 'Rapido', patterns: /\b(RAPIDO|ROPPEN)\b/, category: 'transport/cab' },
  { name: 'IRCTC', patterns: /\bIRCTC\b/, category: 'transport/public-transport' },
  {
    name: 'Metro',
    patterns: /\b(BMRCL|DMRC|NAMMA METRO|METRO RAIL|MUMBAI METRO)\b/,
    category: 'transport/public-transport',
  },
  { name: 'FASTag', patterns: /\bFASTAG\b/, category: 'transport/parking' },
  { name: 'Indian Oil', patterns: /\b(IOCL|INDIAN OIL)\b/, category: 'transport/fuel' },
  { name: 'HP Petrol', patterns: /\b(HPCL|HINDUSTAN PETROLEUM)\b/, category: 'transport/fuel' },
  { name: 'Bharat Petroleum', patterns: /\b(BPCL|BHARAT PETROLEUM)\b/, category: 'transport/fuel' },
  { name: 'Airtel', patterns: /\bAIRTEL\b/, category: 'bills/mobile' },
  { name: 'Jio', patterns: /\b(JIO|RELIANCE JIO)\b/, category: 'bills/mobile' },
  { name: 'Vi', patterns: /\b(VODAFONE|VODAFONE IDEA)\b/, category: 'bills/mobile' },
  { name: 'BSNL', patterns: /\bBSNL\b/, category: 'bills/internet' },
  { name: 'ACT Fibernet', patterns: /\bACT (FIBERNET|BROADBAND)\b/, category: 'bills/internet' },
  { name: 'BESCOM', patterns: /\bBESCOM\b/, category: 'bills/electricity' },
  { name: 'Tata Power', patterns: /\bTATA POWER\b/, category: 'bills/electricity' },
  { name: 'Adani Electricity', patterns: /\bADANI ELECTRICITY\b/, category: 'bills/electricity' },
  { name: 'MSEDCL', patterns: /\b(MSEDCL|MAHAVITARAN)\b/, category: 'bills/electricity' },
  { name: 'Netflix', patterns: /\bNETFLIX\b/, category: 'entertainment/ott' },
  { name: 'Spotify', patterns: /\bSPOTIFY\b/, category: 'entertainment/ott' },
  {
    name: 'Disney+ Hotstar',
    patterns: /\b(HOTSTAR|NOVI DIGITAL)\b/,
    category: 'entertainment/ott',
  },
  { name: 'YouTube Premium', patterns: /\bYOUTUBE\b/, category: 'entertainment/ott' },
  {
    name: 'BookMyShow',
    patterns: /\b(BOOKMYSHOW|BIGTREE ENTERTAINMENT)\b/,
    category: 'entertainment/movies',
  },
  { name: 'PVR INOX', patterns: /\b(PVR|INOX)\b/, category: 'entertainment/movies' },
  { name: 'Apollo Pharmacy', patterns: /\bAPOLLO PHARM/, category: 'healthcare/medicine' },
  { name: 'PharmEasy', patterns: /\bPHARMEASY\b/, category: 'healthcare/medicine' },
  { name: 'Tata 1mg', patterns: /\b(1MG|TATA 1MG)\b/, category: 'healthcare/medicine' },
  { name: 'Starbucks', patterns: /\b(STARBUCKS|TATA STARBUCKS)\b/, category: 'food/coffee' },
  { name: 'Third Wave Coffee', patterns: /\b(THIRD WAVE|TWC ROASTERS)\b/, category: 'food/coffee' },
  { name: 'Blue Tokai', patterns: /\bBLUE TOKAI\b/, category: 'food/coffee' },
  { name: 'Chai Point', patterns: /\bCHAI ?POINT\b/, category: 'food/snacks' },
  {
    name: "McDonald's",
    patterns: /\b(MCDONALDS|MC DONALDS|HARDCASTLE)\b/,
    category: 'food/restaurants',
  },
  { name: "Domino's", patterns: /\b(DOMINOS|JUBILANT FOODWORKS)\b/, category: 'food/restaurants' },
  { name: 'KFC', patterns: /\bKFC\b/, category: 'food/restaurants' },
  { name: 'Groww', patterns: /\b(GROWW|NEXTBILLION)\b/, category: 'financial/sip' },
  { name: 'Zerodha', patterns: /\bZERODHA\b/, category: 'financial/investment' },
  {
    name: 'LIC',
    patterns: /\b(LIC|LIFE INSURANCE CORPORATION)\b/,
    category: 'financial/insurance',
  },
];

export function findKnownMerchant(key: string): KnownMerchant | null {
  return KNOWN_MERCHANTS.find((m) => m.patterns.test(key)) ?? null;
}

/**
 * Generic wording that suggests a category when the merchant is unknown.
 * Lower confidence than a merchant match.
 */
export const KEYWORD_CATEGORIES: { pattern: RegExp; category: string; flow?: 'IN' | 'OUT' }[] = [
  { pattern: /\b(SALARY|SAL CREDIT|PAYROLL)\b/, category: 'income/salary', flow: 'IN' },
  { pattern: /\b(INTEREST|INT PD|INT\.PD|SB INT)\b/, category: 'income/interest', flow: 'IN' },
  { pattern: /\b(RENT|HOUSE RENT)\b/, category: 'housing/rent', flow: 'OUT' },
  { pattern: /\b(MAINTENANCE|SOCIETY)\b/, category: 'housing/maintenance', flow: 'OUT' },
  { pattern: /\b(EMI|LOAN)\b/, category: 'financial/emi', flow: 'OUT' },
  { pattern: /\b(SIP|MUTUAL FUND|MF)\b/, category: 'financial/sip', flow: 'OUT' },
  { pattern: /\b(INSURANCE|PREMIUM)\b/, category: 'financial/insurance', flow: 'OUT' },
  { pattern: /\b(ELECTRICITY|POWER|DISCOM)\b/, category: 'bills/electricity' },
  { pattern: /\b(BROADBAND|FIBER|FIBRE|INTERNET)\b/, category: 'bills/internet' },
  { pattern: /\b(RECHARGE|PREPAID|POSTPAID)\b/, category: 'bills/mobile' },
  { pattern: /\b(WATER BOARD|WATER BILL|WATER)\b/, category: 'bills/water' },
  { pattern: /\b(PETROL|FUEL|FILLING STATION|PETROLEUM)\b/, category: 'transport/fuel' },
  { pattern: /\b(PARKING|TOLL)\b/, category: 'transport/parking' },
  { pattern: /\b(CAB|TAXI|AUTO)\b/, category: 'transport/cab' },
  { pattern: /\b(PHARMACY|PHARMA|MEDICAL|CHEMIST|MEDICOS)\b/, category: 'healthcare/medicine' },
  { pattern: /\b(HOSPITAL|CLINIC|DENTAL)\b/, category: 'healthcare/hospital' },
  { pattern: /\b(DIAGNOSTIC|LAB|PATHOLOGY)\b/, category: 'healthcare/diagnostics' },
  { pattern: /\b(CAFE|COFFEE)\b/, category: 'food/coffee' },
  {
    pattern: /\b(RESTAURANT|HOTEL|DHABA|BIRYANI|KITCHEN|FOODS?|BAKERY)\b/,
    category: 'food/restaurants',
  },
  {
    pattern: /\b(SUPERMARKET|GROCERY|GROCERIES|KIRANA|MART|PROVISION)\b/,
    category: 'food/groceries',
  },
  { pattern: /\b(CINEMA|MOVIES?)\b/, category: 'entertainment/movies' },
];
