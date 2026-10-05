# API

Base path: `/api`. JSON in and out. Amounts are **integer paise**, and clients
format them for display. Months are `"YYYY-MM"` in India Standard Time.

## Envelope

Success:

```json
{ "success": true, "data": {} }
```

Failure:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid",
    "details": { "fields": { "email": "Enter a valid email address" } }
  }
}
```

| Code                     | HTTP | When                                           |
| ------------------------ | ---- | ---------------------------------------------- |
| `VALIDATION_ERROR`       | 400  | Invalid body/query, malformed JSON             |
| `UNAUTHENTICATED`        | 401  | Missing/invalid/expired token, bad credentials |
| `FORBIDDEN`              | 403  | Changing a built-in category                   |
| `NOT_FOUND`              | 404  | Unknown route or resource                      |
| `CONFLICT`               | 409  | Duplicate email, file, category; import locked |
| `PAYLOAD_TOO_LARGE`      | 413  | Body over limit                                |
| `UNSUPPORTED_MEDIA_TYPE` | 415  | Upload is not a CSV (PDF/XLSX: phase 3)        |
| `RATE_LIMITED`           | 429  | Too many requests                              |
| `INTERNAL_ERROR`         | 500  | Anything unexpected. Never includes internals  |

## Authentication

Authenticated endpoints need `Authorization: Bearer <accessToken>`. Access
tokens are HS256 JWTs (issuer `moneylens`, audience `moneylens-api`) and live
for 15 minutes by default. The refresh token is an opaque random value in the
`ml_rt` cookie (`HttpOnly; SameSite=Strict; Path=/api/auth`, `Secure` in
production).

### `POST /api/auth/register`

Body: `{ "name": string, "email": string, "password": string (10–128) }`
→ `201` `{ user, accessToken, expiresIn }` and sets the refresh cookie.
`409 CONFLICT` if the email exists.

### `POST /api/auth/login`

Body: `{ "email", "password" }` → `200` `{ user, accessToken, expiresIn }` and
sets the refresh cookie. A wrong password and an unknown email return the
identical `401` with similar timing. Rate limited per IP (`AUTH_RATE_LIMIT`
per 15 min).

### `POST /api/auth/refresh`

Uses the cookie and rotates it → `200` `{ user, accessToken, expiresIn }`.
Re-using an already-rotated token revokes the whole session family → `401`.
Refresh has its own rate-limit budget (5 × `AUTH_RATE_LIMIT`) so page reloads
never use up the sign-in budget.

### `POST /api/auth/logout`

Revokes the session family and clears the cookie → `200` `{ loggedOut: true }`.

### `GET /api/auth/me` 🔒

→ `{ id, email, name, createdAt }`

### `DELETE /api/auth/account` 🔒

Body: `{ "password" }`. Re-checks the password, deletes the user and every
row that belongs to them (cascade), and clears the refresh cookie →
`{ deleted: true }`. A wrong password → `400` with `details.fields.password`.
Shares the credential rate limit.

## Dashboard

### `GET /api/dashboard?month=YYYY-MM` 🔒

`month` is optional and defaults to the latest month with confirmed
transactions (or the current month for a new account).

```jsonc
{
  "month": "2026-09",
  "availableMonths": ["2026-04", "…", "2026-09"],
  "historyMonths": 5, // months with data before `month`
  "totals": {
    "incomePaise": 14500000,
    "grossSpendingPaise": 10328300,
    "refundsPaise": 0,
    "spendingPaise": 10328300,
    "cashbackPaise": 1900,
    "savedPaise": 4171700,
    "savingsRatePct": 28.8,
    "spendTransactionCount": 65,
    "averageSpendPaise": 158897,
    "medianSpendPaise": 56300,
  },
  "comparison": {
    // null when the previous month has no data
    "previousMonth": "2026-08",
    "incomeChangePct": 0,
    "spendingChangePct": 4.9,
    "savedChangePaise": -479800,
  },
  "categories": [
    // top-level, net of refunds, largest first
    {
      "categoryId": "…",
      "name": "Housing",
      "slug": "housing",
      "color": null,
      "amountPaise": 3200000,
      "sharePct": 31,
      "transactionCount": 1,
    },
  ],
  "trend": [{ "month": "2026-04", "incomePaise": 0, "spendingPaise": 0, "savedPaise": 0 }], // 6 months ending at `month`
  "topMerchants": [
    { "merchantId": "…", "name": "Swiggy", "amountPaise": 0, "transactionCount": 0 },
  ],
  "savingOpportunities": [], // Insight[] in the "saving" group, largest saving first
  "health": {}, // HealthScore, see GET /api/analytics/health
  "observations": [
    {
      "id": "category-above-average:food-delivery",
      "kind": "OBSERVATION",
      "severity": "high",
      "title": "Food Delivery is ₹3,723 above your 3-month average",
      "explanation": "…",
      "metric": { "label": "Above 3-month average", "valuePaise": 372300 },
      "supportingTransactionIds": ["…"],
    },
  ],
}
```

## Transactions

All transaction responses mask identifiers: `upiIdMasked` ("sw•••••@icici"),
`referenceMasked` ("••••5432"), and UPI IDs and long numbers inside
`description` are masked the same way. Raw values are kept server-side for
duplicate detection only.

### `GET /api/transactions` 🔒

Query (all optional):

| Param                    | Meaning                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `q`                      | Case-insensitive search in merchant name, description and notes           |
| `from`, `to`             | `YYYY-MM-DD`, inclusive, IST days                                         |
| `categoryId`             | Top-level or subcategory id; `uncategorized` for none                     |
| `merchantId`             | A merchant id from `GET /api/merchants`                                   |
| `minAmount`, `maxAmount` | Rupees, e.g. `1,250.50`                                                   |
| `type`                   | Comma-separated `DEBIT,CREDIT,REFUND,CASHBACK,TRANSFER,SELF_TRANSFER,...` |
| `flow`                   | `IN` or `OUT`                                                             |
| `recurring`              | `true` or `false` (part of a detected, non-dismissed recurring series)    |
| `ids`                    | Comma-separated transaction ids (≤ 200), e.g. an insight's evidence       |
| `source`                 | Comma-separated `CSV,GOOGLE_PAY,XLSX,MANUAL,OTHER`                        |
| `status`                 | `CONFIRMED` (default) or `EXCLUDED`                                       |
| `sort`                   | `date_desc` (default), `date_asc`, `amount_desc`, `amount_asc`            |
| `page`, `pageSize`       | Defaults 1 and 25; `pageSize` ≤ 100                                       |

→ `{ items: TransactionItem[], page, pageSize, total, summary }`. `summary` is
the engine's period totals over **every** match, not just the page.

### `GET /api/transactions/:id` 🔒

→ `TransactionItem` plus `sourceFile: { id, filename } | null`, `createdAt`,
`updatedAt`. Another user's id → `404`.

### `PATCH /api/transactions/:id` 🔒

Body (at least one field):

```jsonc
{
  "categoryId": "…", // top-level or subcategory; null clears it
  "merchantName": "Swiggy",
  "notes": "Team lunch", // null clears
  "transactionType": "REFUND", // flow follows the type for DEBIT/CREDIT/REFUND/CASHBACK
  "status": "EXCLUDED", // excluded transactions leave every total
  "applyToMerchant": true, // needs categoryId
}
```

With `applyToMerchant`, the merchant remembers the category, a `MERCHANT`
rule is stored for future imports, and the merchant's other transactions are
recategorised. → `{ transaction: TransactionDetail, alsoUpdated: number }`.

### `DELETE /api/transactions/:id` 🔒

→ `{ deleted: true }`.

### `DELETE /api/transactions` 🔒

Body: `{ "confirm": "DELETE" }`. Deletes every transaction, import, recurring
group and insight for the user. Merchants and category rules are kept →
`{ deleted: { transactions, imports } }`.

## Imports

A statement is parsed into staged rows. Nothing reaches the user's
transactions until `confirm`. See [IMPORT_PIPELINE.md](IMPORT_PIPELINE.md).

### `POST /api/imports` 🔒

`multipart/form-data` with one `file` field (at most `MAX_UPLOAD_MB`) and two
optional text fields:

| Field      | Use                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------- |
| `password` | Password of a protected PDF. Used once in memory; never stored, logged or returned            |
| `mapping`  | JSON `{"headerRow": n, "columns": {"date": i, "description": i, "amount": i, ...}}` (0-based) |

`columns` keys: `date`, `description`, `amount`, `debit`, `credit`,
`direction`, `reference`, `upi`.

- `.pdf` (Google Pay statement), `.csv` or `.xlsx` → `201` `ImportReview` with
  status `READY_FOR_REVIEW`.
- Needs input from the user → `400` `VALIDATION_ERROR` with
  `details.reason`, and nothing is recorded:
  - `PASSWORD_REQUIRED` / `PASSWORD_INCORRECT`: re-send with `password`.
  - `COLUMNS_NOT_FOUND`: `details.preview` holds the first 15 rows (≤ 12
    columns, ≤ 40 characters each); re-send with `mapping`.
- A file that cannot be read at all → `201` `ImportReview` with status
  `FAILED` and `errorMessage`. It stays in the history.
- `.xls`, other extensions, or bytes that do not match the extension (a
  `.csv` that is a PDF, a `.xlsx` that is not a ZIP, an encrypted workbook)
  → `415` with an explanation.
- The same bytes already imported or awaiting review → `409` with
  `details.importId`.
- Too large → `413`.

### `GET /api/imports` 🔒

→ `ImportRecord[]`, newest first (up to 100).

### `GET /api/imports/:id` 🔒

→ `ImportReview`:

```jsonc
{
  "import": {
    "id": "…",
    "filename": "hdfc.csv",
    "source": "CSV", // GOOGLE_PAY | CSV | XLSX
    "status": "READY_FOR_REVIEW",
    "parserName": "csv@1",
    "statementStart": "2026-09-01",
    "statementEnd": "2026-09-25",
    "detectedCount": 6,
    "duplicateCount": 0,
    "committedCount": 0,
    "errorMessage": null,
    "…": "…",
  },
  "stats": {
    "detected": 6,
    "included": 6,
    "excluded": 0,
    "possibleDuplicates": 0,
    "uncategorized": 0,
    "firstDate": "2026-09-01",
    "lastDate": "2026-09-25",
    "totalDebitsPaise": 4276250,
    "totalCreditsPaise": 14629900,
  },
  "rows": [
    {
      "id": "…",
      "rowIndex": 5,
      "date": "…",
      "amountPaise": 45200,
      "type": "DEBIT",
      "flow": "OUT",
      "rawDescription": "UPI-SWIGGY-sw•••@icici-…",
      "merchantName": "Swiggy",
      "category": { "id": "…", "name": "Food Delivery", "slug": "food-delivery" },
      "categoryConfidence": 0.85,
      "decision": "INCLUDE",
      "duplicateReason": null,
      "warnings": [],
    },
  ],
  "warnings": ["Dates were read as day/month/year …"],
}
```

### `PATCH /api/imports/:id/rows/:rowId` 🔒

Body: any of `decision` (`INCLUDE`/`EXCLUDE`/`DUPLICATE`), `categoryId`
(nullable), `merchantName`, `transactionType`, plus `applyToSimilar: true` to
apply the category, merchant name and type (not the decision) to the other
rows in this import that have the row's current merchant name. Changing the
type to one with a fixed direction (refund, credit, …) updates `flow`. Only
while `READY_FOR_REVIEW`, else `409` → `{ row, stats, similarUpdated }`.

### `POST /api/imports/:id/confirm` 🔒

Commits the `INCLUDE` rows in one database transaction, creating merchants
(with the statement text as an alias) and linking every transaction back to
the import → `{ import, committed }`. A second confirm → `409`.

### `DELETE /api/imports/:id` 🔒

Deletes the import and exactly the transactions it added →
`{ deleted: true, transactions }`.

## Categories

### `GET /api/categories` 🔒

System categories plus the user's own, as a two-level tree:
`[{ id, name, slug, parentId: null, color, icon, isSystem, children: [...] }]`.

### `POST /api/categories` 🔒

Body: `{ "name", "parentId"?: topLevelId | null }` → `201` `CategoryNode`.
Names are unique among siblings (built-in ones included) → `409`.
Subcategories cannot have children → `400`. Up to 100 per user.

### `PATCH /api/categories/:id` 🔒

Body: `{ "name" }`. Built-in categories → `403`; another user's → `404`.

### `DELETE /api/categories/:id` 🔒

Deletes the category and its subcategories. Transactions keep their data and
lose the assignment → `{ deleted: true, uncategorized }`.

## Merchants

### `GET /api/merchants` 🔒

→ `[{ id, name, transactionCount }]`, sorted by name.

### `PATCH /api/merchants/:id` 🔒

Body: `{ "name" }`. Renames the merchant and its transactions. The old name
is kept as an alias (so statements that use it still match) and merchant
rules follow the new name. A name another of the user's merchants already
has → `409` with `details.merchantId` (merge instead) →
`{ id, name, transactionCount }`.

### `POST /api/merchants/:id/merge` 🔒

Body: `{ "intoId" }`. Moves the merchant's transactions, aliases, rules and
recurring payments to `intoId`, keeps `intoId`'s own category choice (or
takes this one's if it had none), and deletes `:id`. Same id → `400`;
another user's merchant → `404` → the kept merchant
`{ id, name, transactionCount }`.

## Analytics

Every figure comes from the deterministic engine over confirmed transactions.
`month` defaults to the latest month with data.

| Endpoint                                                         | Returns                                                                                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/analytics/monthly?month=`                              | `{ month, availableMonths, totals, comparison }`                                                                                                   |
| `GET /api/analytics/categories?month=&level=top\|leaf&parentId=` | `{ month, parent, items: CategoryBreakdownItem[] }`; `parentId` drills into one top-level category                                                 |
| `GET /api/analytics/merchants?month=&limit=` (≤ 50, default 10)  | `{ month, items: MerchantSummaryItem[] }`                                                                                                          |
| `GET /api/analytics/trends?end=&months=` (≤ 24, default 6)       | `{ points: MonthlyTrendPoint[] }`                                                                                                                  |
| `GET /api/analytics/health?month=`                               | `HealthScore`: `score` (0–100 or null), `components[]` with weight, score, measured value, formula and `unavailableReason`, `method`, `monthsUsed` |
| `GET /api/analytics/comparisons?month=`                          | `{ month, availableMonths, totals: PeriodComparisonRow[], categories: CategoryComparisonRow[], patterns: SpendingPatterns }`                       |

`totals` compares spending with the previous month, the 3- and 6-month
averages (months with data only), the quarter so far and the year to date.
`changePct` is null when there is no baseline data. `patterns` holds weekday
vs weekend per-day averages, spending by weekday and by week (Monday start),
month-to-month volatility (coefficient of variation, needs 3 months), the
largest payments, refunds, cashback and transfers in and out.

## Insights

### `GET /api/insights?month=YYYY-MM` 🔒

```jsonc
{
  "month": "2026-09",
  "availableMonths": ["…"],
  "historyMonths": 5,
  "insights": [
    {
      "id": "leak-food-delivery",
      "rule": "leak-food-delivery",
      "group": "saving", // spending | saving | behaviour | recurring | anomalies | planning
      "kind": "OBSERVATION", // or CALCULATION
      "severity": "medium", // high | medium | low | info
      "title": "Potential saving opportunity: 14 food delivery orders cost ₹8,900",
      "explanation": "…",
      "metric": { "label": "Food delivery this month", "valuePaise": 890000 },
      "supportingTransactionIds": ["…"],
      "confidence": 0.75, // 0..1
      "recommendation": "Choose one or two fixed days for ordering in.", // or null
      "potentialMonthlySavingPaise": 372300, // saving group only
      "assumption": "Bringing food delivery back to your 3-month average would save about ₹3,723 a month.",
    },
  ],
  "skipped": [
    { "rule": "category-increase", "reason": "Needs at least 2 earlier months of data." },
  ],
}
```

Saving opportunities come first, then insights by severity. Every insight is
produced by a fixed rule; none is AI-generated. Fetch the evidence with
`GET /api/transactions?ids=a,b,c`.

## Recurring payments

### `GET /api/recurring` 🔒

Series detected over the last 15 months, as of today:
`{ items: RecurringPaymentItem[], monthlyOutgoingPaise, annualOutgoingPaise }`.
Each item has `id`, `label`, `flow`, `frequency` (`WEEKLY`, `MONTHLY`,
`QUARTERLY`, `YEARLY`), `typicalAmountPaise`, `amountVaries`, `occurrences`,
`firstDate`, `lastDate`, `nextExpectedDate`, `monthlyEquivalentPaise`,
`annualEquivalentPaise`, `confidence`, `subscriptionLike`, `active`,
`dismissed` and `transactionIds`. Totals count active, non-dismissed outgoing
items.

### `PATCH /api/recurring/:id` 🔒

`{ "dismissed": true }` marks a series as not recurring (it leaves insights,
totals and the `recurring=true` transaction filter); `false` brings it back.
Returns the updated list.

## Reports

### `GET /api/reports/monthly?month=&compare=` 🔒

`compare` defaults to the month before and must differ from `month`. Returns
`MonthlyReport`: `executiveSummary` (labelled statements), `totals` and
`compareTotals`, `incomeSources`, `categories` (with the compared month and
3-month average), `merchants` (with the compared month), `recurring`,
`biggestTransactions`, `changes`, `behaviour`, `savingOpportunities`,
`recommendations` (labelled `RECOMMENDATION`) and `health`. `compareMonth` is
null when the compared month has no data.

## Money plan

Amounts in request bodies are rupee strings (`"145000"`, `"2450.50"`); every
response amount is in paise. The plan is an educational planning suggestion,
not professional financial advice, and says so in `plan.disclaimer`.

### `GET /api/money-plan` 🔒

→ `{ profile, plan, savedAt }`. `profile` is null until the first save.
`plan` is always calculated, from the saved figures and the latest three
complete months of transactions:

```jsonc
{
  "ready": true, // false until monthly income is entered
  "missing": [],
  "baseline": { "months": ["2026-07", "2026-08", "2026-09"], "incomePaise": 14500000, "…": "…" },
  "breakdown": [
    {
      "key": "income",
      "label": "Monthly income",
      "amountPaise": 14500000,
      "source": "ENTERED",
      "note": null,
    },
    {
      "key": "essential",
      "label": "Essential expenses (…)",
      "amountPaise": 1666100,
      "source": "OBSERVED",
      "note": "3-month average from your transactions",
    },
    {
      "key": "surplus",
      "label": "Available surplus",
      "amountPaise": 3689400,
      "source": "CALCULATED",
      "note": "…",
    },
  ],
  "surplusPaise": 3689400,
  "goals": [
    {
      "key": "savings",
      "label": "Savings target",
      "amountPaise": 2500000,
      "source": "ENTERED",
      "note": null,
    },
  ],
  "afterGoalsPaise": 1189400,
  "status": "on-track", // tight | shortfall | incomplete
  "suggestions": [{ "kind": "RECOMMENDATION", "text": "…" }],
  "suggestedBudgets": [
    {
      "categoryId": "…",
      "name": "Groceries",
      "kind": "essential",
      "averagePaise": 829000,
      "suggestedPaise": 830000,
      "reason": "…",
    },
  ],
  "disclaimer": "Educational planning suggestion … not professional financial advice.",
}
```

### `POST /api/money-plan` 🔒

Replaces the figures. Body (every field optional, empty or null clears it):
`monthlyIncome`, `fixedExpenses`, `emis`, `insurance`, `investments`,
`savingsTarget` (all monthly), `emergencyFundTarget`, `emergencyFundCurrent`
(totals) and `upcomingExpenses: [{ label, amount, dueMonth: "YYYY-MM" }]`
(up to 10). → `{ profile, plan, savedAt }`.

### `PATCH /api/money-plan` 🔒

Same fields; only the ones sent change. → `{ profile, plan, savedAt }`.

### `POST /api/money-plan/simulate` 🔒

Nothing is saved. Body:

```jsonc
{
  "adjustments": [
    { "type": "category-percent", "categoryId": "…", "percent": 20 },
    { "type": "category-amount", "categoryId": "…", "amount": "3000" },
    { "type": "save-more", "amount": "5000" },
    { "type": "income-change", "amount": "-10000" }, // signed
  ], // 1 to 10
  "annualReturnPct": 6, // 0 to 15, default 0
}
```

→ `SimulationResult`: `baseline` (monthly income, spending and saved),
`adjustments` (each with its monthly impact and a note, for example when a
reduction is capped at the category's average), `monthlyImpactPaise`,
`annualImpactPaise`, `newMonthlySavedPaise`, `projections` at 1, 3, 5 and 10
years (`contributedPaise`, `withReturnPaise`) and `assumptions`. An unknown
category → `400`.

## Budgets

### `GET /api/budgets?month=YYYY-MM` 🔒

`month` defaults to the current month. → `{ month, availableMonths, items,
totalBudgetPaise, totalSpentPaise, unbudgetedSpendingPaise, daysElapsed,
daysInMonth }`. Each item has `categoryId`, `name`, `amountPaise`,
`spentPaise` (net of refunds, including subcategories), `remainingPaise`,
`usedPct`, `status` (`under`, `near` from 80%, `over`) and `projectedPaise`
(the month in progress only; null otherwise).

### `PUT /api/budgets/:month` 🔒

Body: `{ "items": [{ "categoryId": "…", "amount": "8000" }] }` (1 to 100
items). An `amount` of `null` removes that budget; categories not listed are
left alone. The category must be a system category or one of the user's own.
→ the month's `BudgetsResponse`.

## Health

### `GET /api/health`

→ `{ status: "ok" }` when the database answers. Used by container health checks.

## Planned endpoints

| Phase | Endpoints           |
| ----- | ------------------- |
| 6     | `POST /api/ai/chat` |
