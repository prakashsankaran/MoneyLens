import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address' }))
  .refine((v) => v.length <= 254, 'Email is too long');

/**
 * Password policy: length matters more than composition rules (NIST 800-63B).
 * The upper bound protects the hashing function from very large inputs.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80, 'Name is too long'),
  email: emailSchema,
  password: passwordSchema,
  /** Needed when the server only allows sign-up by invitation. */
  inviteCode: z.string().trim().max(64, 'Invite code is too long').optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Do not apply the registration policy on login; just bound the input.
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** "YYYY-MM" calendar month. */
export const monthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected a month in YYYY-MM format');

export const dashboardQuerySchema = z.object({
  month: monthKeySchema.optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" calendar date (interpreted in IST by the API). */
export const dayKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Expected a date in YYYY-MM-DD format');

const idSchema = z.string().trim().min(1).max(64);

/** Rupee amount as typed by a user, e.g. "1,250.50". */
export const rupeeAmountSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[,₹\s]/g, ''))
  .pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter an amount like 1250 or 1250.50'));

const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).max(values.length));

export const TRANSACTION_SORTS = ['date_desc', 'date_asc', 'amount_desc', 'amount_asc'] as const;
export type TransactionSort = (typeof TRANSACTION_SORTS)[number];

export const transactionQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    from: dayKeySchema.optional(),
    to: dayKeySchema.optional(),
    categoryId: idSchema.optional(),
    merchantId: idSchema.optional(),
    minAmount: rupeeAmountSchema.optional(),
    maxAmount: rupeeAmountSchema.optional(),
    type: csvEnum([
      'DEBIT',
      'CREDIT',
      'REFUND',
      'CASHBACK',
      'TRANSFER',
      'SELF_TRANSFER',
      'UNKNOWN',
    ] as const).optional(),
    flow: z.enum(['IN', 'OUT']).optional(),
    recurring: z.enum(['true', 'false']).optional(),
    /** Comma-separated transaction ids, e.g. the evidence behind an insight. */
    ids: z
      .string()
      .trim()
      .transform((v) =>
        v
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      )
      .pipe(z.array(idSchema).min(1).max(200))
      .optional(),
    source: csvEnum(['GOOGLE_PAY', 'CSV', 'XLSX', 'PDF', 'MANUAL', 'OTHER'] as const).optional(),
    status: z.enum(['CONFIRMED', 'EXCLUDED']).default('CONFIRMED'),
    sort: z.enum(TRANSACTION_SORTS).default('date_desc'),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'Start date must be on or before the end date',
    path: ['to'],
  })
  .refine((v) => !v.minAmount || !v.maxAmount || Number(v.minAmount) <= Number(v.maxAmount), {
    message: 'Minimum must not exceed maximum',
    path: ['maxAmount'],
  });
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;
export type TransactionQueryInput = z.input<typeof transactionQuerySchema>;

const TRANSACTION_TYPES = [
  'DEBIT',
  'CREDIT',
  'REFUND',
  'CASHBACK',
  'TRANSFER',
  'SELF_TRANSFER',
  'UNKNOWN',
] as const;
const PAYMENT_METHOD_VALUES = ['CASH', 'UPI', 'CARD', 'NETBANKING', 'WALLET', 'OTHER'] as const;
/** Types that only go one way; the rest (transfers, unknown) can go either way. */
const ONE_WAY_TYPES: Record<string, 'IN' | 'OUT'> = {
  DEBIT: 'OUT',
  CREDIT: 'IN',
  REFUND: 'IN',
  CASHBACK: 'IN',
};
const positiveAmount = rupeeAmountSchema.refine((v) => Number(v) > 0, 'Enter an amount above zero');
/** "HH:MM", 24-hour, India Standard Time. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time like 14:30');

/** POST /api/transactions: a payment added by hand, such as cash. */
export const createTransactionSchema = z
  .object({
    date: dayKeySchema,
    time: timeOfDaySchema.optional(),
    amount: positiveAmount,
    flow: z.enum(['OUT', 'IN']),
    /** Defaults to a payment for money out and money in for money in. */
    transactionType: z.enum(TRANSACTION_TYPES).optional(),
    merchantName: z
      .string()
      .trim()
      .min(1, 'Enter who you paid, or who paid you')
      .max(80, 'Use at most 80 characters'),
    /** A top-level or subcategory id. Left out: the merchant's usual category, if any. */
    categoryId: idSchema.nullable().optional(),
    paymentMethod: z.enum(PAYMENT_METHOD_VALUES).default('CASH'),
    notes: z.string().trim().max(500, 'Use at most 500 characters').optional(),
  })
  .refine((v) => !v.transactionType || (ONE_WAY_TYPES[v.transactionType] ?? v.flow) === v.flow, {
    message: 'That type does not match money in or out',
    path: ['transactionType'],
  });
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type CreateTransactionFormInput = z.input<typeof createTransactionSchema>;

export const updateTransactionSchema = z
  .object({
    /** A top-level or subcategory id; null clears the category. */
    categoryId: idSchema.nullable().optional(),
    merchantName: z.string().trim().min(1).max(80).optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    transactionType: z
      .enum(['DEBIT', 'CREDIT', 'REFUND', 'CASHBACK', 'TRANSFER', 'SELF_TRANSFER', 'UNKNOWN'])
      .optional(),
    status: z.enum(['CONFIRMED', 'EXCLUDED']).optional(),
    paymentMethod: z.enum(PAYMENT_METHOD_VALUES).nullable().optional(),
    /** Only for transactions added by hand; imported ones keep the statement's figures. */
    amount: positiveAmount.optional(),
    /** Only for transactions added by hand. Keeps the time of day unless `time` is sent. */
    date: dayKeySchema.optional(),
    time: timeOfDaySchema.optional(),
    /** Only for transactions added by hand. */
    flow: z.enum(['OUT', 'IN']).optional(),
    /**
     * Also use this category for the merchant's other transactions and for
     * future imports from the same merchant.
     */
    applyToMerchant: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'applyToMerchant'), {
    message: 'Nothing to update',
  })
  .refine((v) => !v.applyToMerchant || v.categoryId !== undefined, {
    message: 'Choose a category to apply to the merchant',
    path: ['applyToMerchant'],
  });
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export const renameMerchantSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80),
});
export type RenameMerchantInput = z.infer<typeof renameMerchantSchema>;

export const mergeMerchantSchema = z.object({ intoId: idSchema });
export type MergeMerchantInput = z.infer<typeof mergeMerchantSchema>;

/**
 * Column choice for a spreadsheet whose headings were not recognised, sent as
 * a JSON string in the upload form.
 */
export const columnMappingSchema = z.object({
  headerRow: z.number().int().min(0).max(50),
  columns: z
    .object({
      date: z.number().int().min(0).max(200).optional(),
      description: z.number().int().min(0).max(200).optional(),
      amount: z.number().int().min(0).max(200).optional(),
      debit: z.number().int().min(0).max(200).optional(),
      credit: z.number().int().min(0).max(200).optional(),
      direction: z.number().int().min(0).max(200).optional(),
      reference: z.number().int().min(0).max(200).optional(),
      upi: z.number().int().min(0).max(200).optional(),
    })
    .strict(),
});
export type ColumnMappingInput = z.infer<typeof columnMappingSchema>;

/** Typed confirmation for destructive bulk actions. */
export const confirmDeleteAllSchema = z.object({
  confirm: z.literal('DELETE', { message: 'Type DELETE to confirm' }),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password').max(128),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the current one',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * A recovery key as the owner types it: 24 letters and digits, usually in
 * groups of four. Case, spaces and dashes are ignored, and letters that look
 * like digits (O, I, L) are read as those digits.
 */
export const recoveryKeySchema = z
  .string()
  .max(64, 'Enter your recovery key')
  .transform((v) => v.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1'))
  .pipe(z.string().regex(/^[0-9A-Z]{24}$/, 'A recovery key has 24 letters and digits'));

export const resetWithRecoveryKeySchema = z.object({
  email: emailSchema,
  recoveryKey: recoveryKeySchema,
  newPassword: passwordSchema,
});
export type ResetWithRecoveryKeyInput = z.infer<typeof resetWithRecoveryKeySchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** The token from an emailed reset link, and the new password. */
export const resetWithLinkSchema = z.object({
  token: z.string().min(20, 'This reset link is incomplete').max(200),
  newPassword: passwordSchema,
});
export type ResetWithLinkInput = z.infer<typeof resetWithLinkSchema>;

/** Making a new recovery key re-checks the password. */
export const createRecoveryKeySchema = z.object({
  password: z.string().min(1, 'Enter your password').max(128),
});
export type CreateRecoveryKeyInput = z.infer<typeof createRecoveryKeySchema>;

/** Mobile clients send the refresh token in the body instead of a cookie. */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(16).max(256),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(40, 'Use at most 40 characters'),
  parentId: idSchema.nullable().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(40, 'Use at most 40 characters'),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

export const updateImportRowSchema = z
  .object({
    decision: z.enum(['INCLUDE', 'EXCLUDE', 'DUPLICATE']).optional(),
    categoryId: idSchema.nullable().optional(),
    merchantName: z.string().trim().min(1).max(80).optional(),
    transactionType: z
      .enum(['DEBIT', 'CREDIT', 'REFUND', 'CASHBACK', 'TRANSFER', 'SELF_TRANSFER', 'UNKNOWN'])
      .optional(),
    /**
     * Also apply the category, merchant name or type to the other rows in this
     * import from the same merchant.
     */
    applyToSimilar: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'applyToSimilar'), {
    message: 'Nothing to update',
  });
export type UpdateImportRowInput = z.infer<typeof updateImportRowSchema>;

/** Give many review rows the same category in one step. */
export const categorizeImportRowsSchema = z.object({
  rowIds: z.array(idSchema).min(1, 'Choose at least one row').max(20_000),
  categoryId: idSchema.nullable(),
});
export type CategorizeImportRowsInput = z.infer<typeof categorizeImportRowsSchema>;

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const analyticsMonthQuerySchema = z.object({ month: monthKeySchema.optional() });

export const monthlyReportQuerySchema = z
  .object({
    month: monthKeySchema.optional(),
    /** Month to compare with; defaults to the month before. */
    compare: monthKeySchema.optional(),
  })
  .refine((v) => !v.month || !v.compare || v.compare !== v.month, {
    message: 'Choose a different month to compare with',
    path: ['compare'],
  });

export const updateRecurringSchema = z.object({
  /** Hide a series that is not really recurring, or bring it back. */
  dismissed: z.boolean(),
});
export type UpdateRecurringInput = z.infer<typeof updateRecurringSchema>;

export const categoryAnalyticsQuerySchema = z.object({
  month: monthKeySchema.optional(),
  level: z.enum(['top', 'leaf']).default('top'),
  /** Drill into one top-level category: its subcategories only. */
  parentId: idSchema.optional(),
});

export const merchantAnalyticsQuerySchema = z.object({
  month: monthKeySchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/** Rejects dates like 2026-02-31 that match the format but do not exist. */
const isRealDay = (key: string) => new Date(`${key}T00:00:00Z`).toISOString().startsWith(key);

/** Longest range the period analysis accepts: three years. */
export const MAX_PERIOD_DAYS = 1100;

export const periodAnalyticsQuerySchema = z
  .object({
    from: dayKeySchema,
    to: dayKeySchema,
    /** Compare with the period just before (default) or the same dates last year. */
    compare: z.enum(['previous', 'lastYear']).default('previous'),
  })
  .refine((q) => isRealDay(q.from) && isRealDay(q.to), {
    message: 'Expected a real calendar date',
    path: ['from'],
  })
  .refine((q) => q.from <= q.to, {
    message: 'Start date must be on or before the end date',
    path: ['to'],
  })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 + 1 <= MAX_PERIOD_DAYS, {
    message: 'Choose a period of up to three years',
    path: ['from'],
  });

export const trendQuerySchema = z.object({
  end: monthKeySchema.optional(),
  months: z.coerce.number().int().min(1).max(24).default(6),
});

// ---------------------------------------------------------------------------
// Money plan, budgets and the what-if simulator (Phase 5)
// ---------------------------------------------------------------------------

/** An optional rupee amount: blank or null clears it. */
const optionalRupees = z
  .union([z.literal(''), z.null(), rupeeAmountSchema])
  .transform((v) => (v === '' ? null : v))
  .optional();

export const upcomingExpenseSchema = z.object({
  label: z.string().trim().min(1, 'Name the expense').max(60),
  amount: rupeeAmountSchema.refine((v) => Number(v) > 0, 'Enter an amount above zero'),
  dueMonth: monthKeySchema,
});

const profileFields = {
  monthlyIncome: optionalRupees,
  fixedExpenses: optionalRupees,
  emis: optionalRupees,
  insurance: optionalRupees,
  investments: optionalRupees,
  savingsTarget: optionalRupees,
  emergencyFundTarget: optionalRupees,
  emergencyFundCurrent: optionalRupees,
  upcomingExpenses: z.array(upcomingExpenseSchema).max(20, 'Up to 20 upcoming expenses').optional(),
};

/** POST /api/money-plan: the whole profile; fields left out are cleared. */
export const moneyPlanSchema = z.object(profileFields);
export type MoneyPlanInput = z.input<typeof moneyPlanSchema>;
/** PATCH /api/money-plan: only the fields sent change. */
export const moneyPlanPatchSchema = z.object(profileFields);

/** A signed rupee amount, e.g. "-5,000" for a fall in income. */
const signedRupees = z
  .string()
  .trim()
  .transform((v) => v.replace(/[,₹\s]/g, ''))
  .pipe(z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/, 'Enter an amount like 5000 or -5000'));

const positiveRupees = rupeeAmountSchema.refine((v) => Number(v) > 0, 'Enter an amount above zero');

export const scenarioAdjustmentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('category-percent'),
    categoryId: idSchema,
    percent: z.coerce.number().int().min(1).max(100),
  }),
  z.object({ type: z.literal('category-amount'), categoryId: idSchema, amount: positiveRupees }),
  z.object({ type: z.literal('save-more'), amount: positiveRupees }),
  z.object({
    type: z.literal('income-change'),
    amount: signedRupees.refine((v) => Number(v) !== 0, 'Enter a change other than zero'),
  }),
]);
export type ScenarioAdjustmentInput = z.input<typeof scenarioAdjustmentSchema>;

export const simulationSchema = z.object({
  adjustments: z.array(scenarioAdjustmentSchema).min(1, 'Add at least one change').max(10),
  /** Assumed yearly return, in percent. */
  annualReturnPct: z.coerce.number().min(0).max(15).default(0),
});
export type SimulationInput = z.input<typeof simulationSchema>;

export const budgetsQuerySchema = z.object({ month: monthKeySchema.optional() });

export const putBudgetsSchema = z.object({
  items: z
    .array(
      z.object({
        categoryId: idSchema,
        /** null removes the budget. */
        amount: z.union([z.null(), positiveRupees]),
      }),
    )
    .min(1)
    .max(100),
});
export type PutBudgetsInput = z.input<typeof putBudgetsSchema>;

// ---------------------------------------------------------------------------
// MoneyLens AI (Phase 6)
// ---------------------------------------------------------------------------

export const ASSISTANT_MESSAGE_MAX = 500;

export const chatSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Type a question')
    .max(ASSISTANT_MESSAGE_MAX, `Keep questions under ${ASSISTANT_MESSAGE_MAX} characters`),
  /** Continue an existing conversation; omit to start a new one. */
  conversationId: idSchema.optional(),
  /** The month to explain; defaults to the latest month with data. */
  month: monthKeySchema.optional(),
});
export type ChatInput = z.input<typeof chatSchema>;

export const briefQuerySchema = z.object({ month: monthKeySchema.optional() });

// ---------------------------------------------------------------------------
// Backup and restore
// ---------------------------------------------------------------------------

export const BACKUP_FORMAT = 'moneylens-backup';
export const BACKUP_VERSION = 1;
/** More than any personal history; keeps a restore within memory and time limits. */
export const BACKUP_MAX_TRANSACTIONS = 100_000;

const backupText = (max: number) => z.string().max(max);
const optionalText = (max: number) => backupText(max).nullable();
/** A rupee amount as written by the backup, e.g. "450" or "1250.5". */
const backupAmount = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Expected an amount');
const isoDateTime = z.iso.datetime({ offset: true });
/**
 * A category reference that works across databases: system categories by
 * slug ("system:food" or "system:food/food-delivery"), the owner's own
 * categories by their id in the backup ("custom:<id>").
 */
const categoryRef = z
  .string()
  .regex(/^(system:[a-z0-9-]{1,60}(\/[a-z0-9-]{1,60})?|custom:[A-Za-z0-9_-]{1,64})$/);

export const backupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT, { message: 'This is not a MoneyLens backup file' }),
  version: z.literal(BACKUP_VERSION, {
    message: 'This backup was made by a newer version of MoneyLens. Update the app first.',
  }),
  exportedAt: isoDateTime,
  account: z.object({ name: backupText(80) }),
  categories: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        parent: categoryRef.nullable(),
        name: backupText(80).min(1),
        slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
        icon: optionalText(40),
        color: optionalText(20),
        sortOrder: z.number().int(),
      }),
    )
    .max(1000),
  merchants: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: backupText(120).min(1),
        normalizedName: backupText(120).min(1),
        defaultCategory: categoryRef.nullable(),
        userCategory: categoryRef.nullable(),
        confidence: z.number().min(0).max(1),
        aliases: z.array(backupText(200).min(1)).max(200),
      }),
    )
    .max(50_000),
  rules: z
    .array(
      z.object({
        matchField: z.enum(['MERCHANT', 'DESCRIPTION', 'UPI_ID']),
        pattern: backupText(200).min(1),
        category: categoryRef,
        priority: z.number().int(),
      }),
    )
    .max(10_000),
  transactions: z
    .array(
      z.object({
        date: isoDateTime,
        amount: backupAmount,
        currency: z.string().length(3),
        type: z.enum([
          'DEBIT',
          'CREDIT',
          'REFUND',
          'CASHBACK',
          'TRANSFER',
          'SELF_TRANSFER',
          'UNKNOWN',
        ]),
        flow: z.enum(['IN', 'OUT']),
        merchantId: z.string().max(64).nullable(),
        merchantName: optionalText(200),
        description: optionalText(1000),
        category: categoryRef.nullable(),
        subcategory: categoryRef.nullable(),
        paymentMethod: z.enum(['UPI', 'CARD', 'NETBANKING', 'CASH', 'WALLET', 'OTHER']).nullable(),
        upiId: optionalText(200),
        reference: optionalText(100),
        source: z.enum(['GOOGLE_PAY', 'CSV', 'XLSX', 'PDF', 'MANUAL', 'OTHER']),
        status: z.enum(['CONFIRMED', 'PENDING_REVIEW', 'EXCLUDED']),
        categoryConfidence: z.number().min(0).max(1).nullable(),
        notes: optionalText(500),
      }),
    )
    .max(BACKUP_MAX_TRANSACTIONS),
  budgets: z
    .array(
      z.object({
        category: categoryRef,
        month: z.string().regex(/^\d{4}-\d{2}-01$/),
        amount: backupAmount,
      }),
    )
    .max(20_000),
  financialProfile: z
    .object({
      monthlyIncome: backupAmount.nullable(),
      fixedExpenses: backupAmount.nullable(),
      emis: backupAmount.nullable(),
      insurance: backupAmount.nullable(),
      investments: backupAmount.nullable(),
      savingsTarget: backupAmount.nullable(),
      emergencyFundTarget: backupAmount.nullable(),
      emergencyFundCurrent: backupAmount.nullable(),
      upcomingExpenses: z
        .array(
          z.object({ label: backupText(60), amount: z.string().max(20), dueMonth: monthKeySchema }),
        )
        .max(20)
        .nullable(),
    })
    .nullable(),
  moneyPlans: z
    .array(
      z.object({
        name: backupText(120),
        inputs: z.unknown(),
        allocation: z.unknown(),
        schemaVersion: z.number().int(),
        isActive: z.boolean(),
        createdAt: isoDateTime,
      }),
    )
    .max(1000),
  /** Recurring series the owner dismissed, by their detection key. */
  dismissedRecurring: z.array(z.string().max(300)).max(10_000),
});
export type BackupFile = z.infer<typeof backupFileSchema>;

/** Restoring over existing data needs this typed confirmation. */
export const REPLACE_CONFIRMATION = 'REPLACE';
