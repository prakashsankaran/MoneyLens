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

// ---------------------------------------------------------------------------
// Categories and merchants
// ---------------------------------------------------------------------------

export interface CategoryNode extends CategoryRef {
  isSystem: boolean;
  children: (CategoryRef & { isSystem: boolean })[];
}

export interface MerchantOption {
  id: string;
  name: string;
  transactionCount: number;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface CategoryLabel {
  id: string;
  name: string;
  slug: string;
}

export interface TransactionItem {
  id: string;
  /** ISO 8601 instant. */
  date: string;
  amountPaise: number;
  currency: string;
  type: TransactionType;
  flow: TransactionFlow;
  merchantId: string | null;
  merchantName: string | null;
  description: string | null;
  category: CategoryLabel | null;
  subcategory: CategoryLabel | null;
  paymentMethod: PaymentMethod | null;
  source: TransactionSource;
  status: TransactionStatus;
  isRecurring: boolean;
  notes: string | null;
  /** Masked by default, e.g. "sw•••••@icici". */
  upiIdMasked: string | null;
  /** Masked by default, e.g. "••••3456". */
  referenceMasked: string | null;
  categoryConfidence: number | null;
}

export interface TransactionDetail extends TransactionItem {
  sourceFile: { id: string; filename: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionList {
  items: TransactionItem[];
  page: number;
  pageSize: number;
  total: number;
  /** Totals over every transaction matching the filters (not just this page). */
  summary: PeriodTotals;
}

export interface TransactionUpdateResult {
  transaction: TransactionDetail;
  /** Other transactions recategorised because the change was applied to the merchant. */
  alsoUpdated: number;
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

export const IMPORT_STATUSES = [
  'UPLOADED',
  'PARSING',
  'READY_FOR_REVIEW',
  'CONFIRMED',
  'FAILED',
  'CANCELLED',
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const IMPORT_ROW_DECISIONS = ['INCLUDE', 'EXCLUDE', 'DUPLICATE'] as const;
export type ImportRowDecision = (typeof IMPORT_ROW_DECISIONS)[number];

export interface ImportRecord {
  id: string;
  filename: string;
  source: TransactionSource;
  parserName: string | null;
  status: ImportStatus;
  createdAt: string;
  confirmedAt: string | null;
  /** "YYYY-MM-DD" in IST. */
  statementStart: string | null;
  statementEnd: string | null;
  detectedCount: number;
  duplicateCount: number;
  committedCount: number;
  errorMessage: string | null;
}

export interface ImportRow {
  id: string;
  rowIndex: number;
  date: string;
  amountPaise: number;
  type: TransactionType;
  flow: TransactionFlow;
  rawDescription: string | null;
  merchantName: string | null;
  category: CategoryLabel | null;
  categoryConfidence: number | null;
  decision: ImportRowDecision;
  duplicateReason: string | null;
  warnings: string[];
}

export interface ImportStats {
  detected: number;
  included: number;
  excluded: number;
  possibleDuplicates: number;
  uncategorized: number;
  /** "YYYY-MM-DD" in IST. */
  firstDate: string | null;
  lastDate: string | null;
  totalDebitsPaise: number;
  totalCreditsPaise: number;
}

export interface ImportReview {
  import: ImportRecord;
  stats: ImportStats;
  rows: ImportRow[];
  /** File-level parser warnings (skipped lines, assumed date format, ...). */
  warnings: string[];
}

export interface ImportRowUpdateResult {
  row: ImportRow;
  stats: ImportStats;
  /** Other rows changed by `applyToSimilar`; the client refetches when > 0. */
  similarUpdated: number;
}

/** Why an upload needs more input from the user (error `details.reason`). */
export type ImportNeedsInputReason =
  'COLUMNS_NOT_FOUND' | 'PASSWORD_REQUIRED' | 'PASSWORD_INCORRECT';

/** `details` of a 400 upload error that the user can resolve. */
export interface ImportNeedsInputDetails {
  reason: ImportNeedsInputReason;
  /** First rows of the sheet, for choosing columns (COLUMNS_NOT_FOUND only). */
  preview?: string[][];
}

export interface ImportConfirmResult {
  import: ImportRecord;
  committed: number;
}

// ---------------------------------------------------------------------------
// Analytics endpoints
// ---------------------------------------------------------------------------

export interface MonthlyAnalytics {
  month: string;
  /** IST months ("YYYY-MM") that have confirmed transactions. */
  availableMonths: string[];
  totals: PeriodTotals;
  comparison: PeriodComparison | null;
}

export interface CategoryAnalytics {
  month: string;
  /** Set when drilling into one top-level category's subcategories. */
  parent: CategoryLabel | null;
  items: CategoryBreakdownItem[];
}

export interface MerchantAnalytics {
  month: string;
  items: MerchantSummaryItem[];
}

export interface TrendAnalytics {
  points: MonthlyTrendPoint[];
}
