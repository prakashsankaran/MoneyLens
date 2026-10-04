/**
 * Domain enums and API contracts shared by the API, web and mobile apps.
 *
 * Enum values mirror the Prisma schema in apps/api/prisma/schema.prisma.
 * Keep them in sync; a unit test in the API asserts they match.
 */

export const TRANSACTION_TYPES = [
  'DEBIT',
  'CREDIT',
  'REFUND',
  'CASHBACK',
  'TRANSFER',
  'SELF_TRANSFER',
  'UNKNOWN',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Direction of money relative to the user's account. */
export const TRANSACTION_FLOWS = ['OUT', 'IN'] as const;
export type TransactionFlow = (typeof TRANSACTION_FLOWS)[number];

export const TRANSACTION_SOURCES = ['GOOGLE_PAY', 'CSV', 'XLSX', 'MANUAL', 'OTHER'] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const TRANSACTION_STATUSES = ['CONFIRMED', 'PENDING_REVIEW', 'EXCLUDED'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const PAYMENT_METHODS = ['UPI', 'CARD', 'NETBANKING', 'CASH', 'WALLET', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * How a statement shown to the user was produced. The UI must label every
 * insight with one of these so AI interpretation is never mistaken for fact.
 */
export const PROVENANCE_KINDS = [
  'FACT',
  'CALCULATION',
  'OBSERVATION',
  'AI_INTERPRETATION',
  'RECOMMENDATION',
] as const;
export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];

export type Severity = 'info' | 'low' | 'medium' | 'high';

/** Calendar month key in Asia/Kolkata, e.g. "2026-09". */
export type MonthKey = `${number}-${string}`;

// ---------------------------------------------------------------------------
// API envelope
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

// ---------------------------------------------------------------------------
// Analytics input
// ---------------------------------------------------------------------------

/**
 * Minimal transaction shape the analytics engine works on.
 * `amountPaise` is always a positive integer; direction comes from `flow`.
 */
export interface AnalyticsTransaction {
  id: string;
  date: Date;
  amountPaise: number;
  type: TransactionType;
  flow: TransactionFlow;
  merchantId: string | null;
  merchantName: string | null;
  categoryId: string | null;
}

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  color: string | null;
  icon: string | null;
}

// ---------------------------------------------------------------------------
// Dashboard DTOs (amounts in paise; clients format for display)
// ---------------------------------------------------------------------------

export interface PeriodTotals {
  incomePaise: number;
  grossSpendingPaise: number;
  refundsPaise: number;
  /** grossSpending - refunds. */
  spendingPaise: number;
  cashbackPaise: number;
  /** income - spending. Can be negative. */
  savedPaise: number;
  /** saved / income, rounded to 1 decimal place. null when there is no income. */
  savingsRatePct: number | null;
  spendTransactionCount: number;
  averageSpendPaise: number;
  medianSpendPaise: number;
}

export interface CategoryBreakdownItem {
  categoryId: string | null;
  name: string;
  slug: string;
  color: string | null;
  amountPaise: number;
  /** Share of total spending, 1 decimal place. */
  sharePct: number;
  transactionCount: number;
}

export interface MonthlyTrendPoint {
  month: string;
  incomePaise: number;
  spendingPaise: number;
  savedPaise: number;
}

export interface MerchantSummaryItem {
  merchantId: string | null;
  name: string;
  amountPaise: number;
  transactionCount: number;
}

export interface Observation {
  id: string;
  kind: ProvenanceKind;
  severity: Severity;
  title: string;
  explanation: string;
  /** The metric that backs the statement, so the UI can show its working. */
  metric: { label: string; valuePaise?: number; value?: number; unit?: string };
  supportingTransactionIds: string[];
}

/** Change versus the previous month; percentages are null when undefined (no base). */
export interface PeriodComparison {
  previousMonth: string;
  incomeChangePct: number | null;
  spendingChangePct: number | null;
  savedChangePaise: number;
}

export interface DashboardData {
  month: string;
  availableMonths: string[];
  /** Number of months of history before `month` used for comparisons. */
  historyMonths: number;
  totals: PeriodTotals;
  /** null when there is no data for the previous month. */
  comparison: PeriodComparison | null;
  categories: CategoryBreakdownItem[];
  trend: MonthlyTrendPoint[];
  topMerchants: MerchantSummaryItem[];
  observations: Observation[];
}
