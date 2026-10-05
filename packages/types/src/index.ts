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
  /** Top potential saving opportunities (Phase 4). */
  savingOpportunities: Insight[];
  health: HealthScore;
}

// ---------------------------------------------------------------------------
// Insights, recurring payments, health score, reports (Phase 4)
// ---------------------------------------------------------------------------

export const INSIGHT_GROUPS = [
  'spending',
  'saving',
  'behaviour',
  'recurring',
  'anomalies',
  'planning',
] as const;
export type InsightGroup = (typeof INSIGHT_GROUPS)[number];

/**
 * A deterministic finding. `kind` says what sort of statement the title is
 * (OBSERVATION for patterns, CALCULATION for totals); `recommendation` is a
 * separate RECOMMENDATION and never mixed into the explanation.
 */
export interface Insight extends Observation {
  group: InsightGroup;
  /** The rule that produced it, e.g. "weekend-spending". */
  rule: string;
  /** 0..1: how strongly the data supports the finding. */
  confidence: number;
  recommendation: string | null;
  /** Saving opportunities only: an estimate and the assumption behind it. */
  potentialMonthlySavingPaise?: number;
  assumption?: string;
}

export interface InsightsResponse {
  month: string;
  availableMonths: string[];
  /** Months of data before `month` that the rules could use. */
  historyMonths: number;
  insights: Insight[];
  /** Rules that could not run, with the reason (e.g. not enough history). */
  skipped: { rule: string; reason: string }[];
}

export type RecurringFrequencyKind = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

/** A payment (or income) that repeats on a regular schedule. */
export interface RecurringSeries {
  /** Stable key: merchant plus direction plus amount band. */
  key: string;
  merchantId: string | null;
  label: string;
  flow: TransactionFlow;
  categoryId: string | null;
  frequency: RecurringFrequencyKind;
  /** Median days between payments. */
  intervalDays: number;
  /** Median amount. */
  typicalAmountPaise: number;
  /** True when amounts differ by more than 15% (bills, utilities). */
  amountVaries: boolean;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  nextExpectedDate: string;
  monthlyEquivalentPaise: number;
  annualEquivalentPaise: number;
  /** 0..1 from schedule regularity, amount stability and history length. */
  confidence: number;
  /** Fixed amount on a monthly/quarterly/yearly schedule, like a subscription. */
  subscriptionLike: boolean;
  /** False when the last payment is overdue by more than half an interval. */
  active: boolean;
  transactionIds: string[];
}

export interface RecurringPaymentItem extends RecurringSeries {
  id: string;
  /** The user said this is not a recurring payment. */
  dismissed: boolean;
}

export interface RecurringSummary {
  items: RecurringPaymentItem[];
  /** CALCULATION over active, non-dismissed outgoing items. */
  monthlyOutgoingPaise: number;
  annualOutgoingPaise: number;
}

export interface HealthComponent {
  key: 'savings' | 'stability' | 'discretionary' | 'obligations' | 'cashflow' | 'budget';
  label: string;
  /** Share of the overall score when available, 0..1 (before re-weighting). */
  weight: number;
  /** 0..100, or null when it cannot be calculated. */
  score: number | null;
  /** The measured input, ready to display ("24.0% of income saved"). */
  measured: string | null;
  /** How the input becomes a score. */
  formula: string;
  /** Why the component is missing, when score is null. */
  unavailableReason: string | null;
}

export interface HealthScore {
  month: string;
  /** Weighted average of available components, 0..100; null when none are. */
  score: number | null;
  components: HealthComponent[];
  /** Plain-language description of the method. */
  method: string;
  /** Months of data the calculation used. */
  monthsUsed: string[];
}

export type ComparisonBaseline = 'previous-month' | 'avg-3' | 'avg-6' | 'quarter' | 'ytd';

export interface PeriodComparisonRow {
  baseline: ComparisonBaseline;
  label: string;
  /** Spending in the current period (month, quarter or YTD). */
  currentPaise: number;
  /** Spending in the comparison period, or the average month. */
  baselinePaise: number;
  changePaise: number;
  changePct: number | null;
  /** Months of data behind the baseline; 0 means not enough data. */
  baselineMonths: number;
}

export interface CategoryComparisonRow {
  categoryId: string | null;
  name: string;
  slug: string;
  currentPaise: number;
  previousPaise: number;
  average3Paise: number;
  changeVsPreviousPct: number | null;
  changeVsAverage3Pct: number | null;
  currentCount: number;
  previousCount: number;
}

export interface SpendingPatterns {
  /** Average spend per weekday and per weekend day in the month (IST). */
  weekdayDailyAveragePaise: number;
  weekendDailyAveragePaise: number;
  /** weekend / weekday, 2 decimals; null when there is no weekday spend. */
  weekendRatio: number | null;
  /** Spending by IST day of week, Monday first. */
  byWeekday: { weekday: number; label: string; amountPaise: number; transactionCount: number }[];
  /** Spending per calendar week (weeks starting Monday) that overlaps the month. */
  weekly: { weekStart: string; amountPaise: number; transactionCount: number }[];
  /** Coefficient of variation of monthly spending, 2 decimals, over `volatilityMonths`. */
  monthlyVolatility: number | null;
  volatilityMonths: number;
  largest: TransactionBrief[];
  refunds: { count: number; amountPaise: number };
  cashback: { count: number; amountPaise: number };
  transfersOut: { count: number; amountPaise: number };
  transfersIn: { count: number; amountPaise: number };
}

export interface TransactionBrief {
  id: string;
  date: string;
  merchantName: string | null;
  amountPaise: number;
  flow: TransactionFlow;
  categoryId: string | null;
}

export interface ComparisonsResponse {
  month: string;
  availableMonths: string[];
  totals: PeriodComparisonRow[];
  categories: CategoryComparisonRow[];
  patterns: SpendingPatterns;
}

export interface ReportStatement {
  kind: ProvenanceKind;
  text: string;
}

export interface MonthlyReport {
  month: string;
  availableMonths: string[];
  compareMonth: string | null;
  executiveSummary: ReportStatement[];
  totals: PeriodTotals;
  compareTotals: PeriodTotals | null;
  incomeSources: MerchantSummaryItem[];
  categories: CategoryComparisonRow[];
  merchants: (MerchantSummaryItem & { previousAmountPaise: number })[];
  recurring: RecurringSeries[];
  biggestTransactions: TransactionBrief[];
  changes: Insight[];
  behaviour: Insight[];
  savingOpportunities: Insight[];
  recommendations: ReportStatement[];
  health: HealthScore;
}

// ---------------------------------------------------------------------------
// Money plan, budgets and the what-if simulator (Phase 5)
// ---------------------------------------------------------------------------

/** A planned one-off cost, e.g. a laptop or school fees. */
export interface UpcomingExpense {
  label: string;
  amountPaise: number;
  /** "YYYY-MM" the money is needed by. */
  dueMonth: string;
}

/** What the user told us about their finances. Every amount is monthly unless noted. */
export interface FinancialProfileData {
  monthlyIncomePaise: number | null;
  /** Rent, maintenance, school fees and other fixed bills. */
  fixedExpensesPaise: number | null;
  emisPaise: number | null;
  insurancePaise: number | null;
  /** SIPs and other regular investments. */
  investmentsPaise: number | null;
  /** Amount to set aside each month. */
  savingsTargetPaise: number | null;
  /** Total emergency fund wanted (not monthly). */
  emergencyFundTargetPaise: number | null;
  /** Emergency fund already saved (not monthly). */
  emergencyFundCurrentPaise: number | null;
  upcomingExpenses: UpcomingExpense[];
  updatedAt: string | null;
}

/**
 * How a spending category is treated by the planner: fixed commitments (rent,
 * EMIs, insurance), investing (SIPs, savings transfers), essentials, lifestyle
 * spending, and everything else.
 */
export type SpendingKind = 'commitment' | 'investing' | 'essential' | 'lifestyle' | 'other';

export interface BaselineCategory {
  categoryId: string | null;
  name: string;
  slug: string;
  kind: SpendingKind;
  /** Average per month over the baseline months. */
  averagePaise: number;
}

/** CALCULATION: monthly averages from the user's transactions. */
export interface ObservedBaseline {
  /** Months averaged, oldest first. Empty when there is no data. */
  months: string[];
  incomePaise: number;
  commitmentsPaise: number;
  investingPaise: number;
  essentialPaise: number;
  lifestylePaise: number;
  otherPaise: number;
  spendingPaise: number;
  categories: BaselineCategory[];
}

/** Where a figure in the plan came from. */
export type PlanLineSource = 'ENTERED' | 'OBSERVED' | 'CALCULATED';

export interface PlanLine {
  key: string;
  label: string;
  amountPaise: number;
  source: PlanLineSource;
  note: string | null;
}

export interface SuggestedBudget {
  categoryId: string;
  name: string;
  kind: SpendingKind;
  averagePaise: number;
  suggestedPaise: number;
  reason: string;
}

export interface MoneyPlanResult {
  /** False until the monthly income is entered. */
  ready: boolean;
  missing: string[];
  baseline: ObservedBaseline;
  /** Income, then each deduction, ending with the available surplus. */
  breakdown: PlanLine[];
  surplusPaise: number;
  /** Monthly amounts needed for the user's goals. */
  goals: PlanLine[];
  /** Surplus left after the goals. Negative is a shortfall. */
  afterGoalsPaise: number;
  status: 'on-track' | 'tight' | 'shortfall' | 'incomplete';
  /** Educational planning suggestions, labelled RECOMMENDATION. */
  suggestions: ReportStatement[];
  suggestedBudgets: SuggestedBudget[];
  disclaimer: string;
}

export interface MoneyPlanResponse {
  profile: FinancialProfileData | null;
  plan: MoneyPlanResult;
  /** When the user last saved the plan. */
  savedAt: string | null;
}

export interface BudgetItem {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  parentId: string | null;
  amountPaise: number;
  /** Net spending in the category (and its subcategories) this month. */
  spentPaise: number;
  remainingPaise: number;
  usedPct: number;
  status: 'under' | 'near' | 'over';
  /** Month in progress only: spending so far scaled to the whole month. */
  projectedPaise: number | null;
}

export interface BudgetsResponse {
  month: string;
  availableMonths: string[];
  items: BudgetItem[];
  totalBudgetPaise: number;
  totalSpentPaise: number;
  /** Spending this month in categories without a budget. */
  unbudgetedSpendingPaise: number;
  /** IST days of the month that have passed (all of them for past months). */
  daysElapsed: number;
  daysInMonth: number;
}

export type ScenarioAdjustment =
  | { type: 'category-percent'; categoryId: string; percent: number }
  | { type: 'category-amount'; categoryId: string; amountPaise: number }
  | { type: 'save-more'; amountPaise: number }
  | { type: 'income-change'; amountPaise: number };

export interface SimulationResult {
  /** CALCULATION: monthly averages the scenario starts from. */
  baseline: { months: string[]; incomePaise: number; spendingPaise: number; savedPaise: number };
  adjustments: { description: string; monthlyImpactPaise: number; note: string | null }[];
  /** Extra money kept each month (negative means less). */
  monthlyImpactPaise: number;
  annualImpactPaise: number;
  newMonthlySavedPaise: number;
  annualReturnPct: number;
  projections: { years: number; contributedPaise: number; withReturnPaise: number }[];
  assumptions: string[];
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
