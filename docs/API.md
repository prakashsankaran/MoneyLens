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
| `recurring`              | `true` or `false`                                                         |
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

`multipart/form-data` with one `file` field, at most `MAX_UPLOAD_MB`.

- `.csv` → `201` `ImportReview` with status `READY_FOR_REVIEW`.
- A CSV that cannot be read → `201` `ImportReview` with status `FAILED` and
  `errorMessage`. It stays in the history.
- `.pdf`, `.xlsx`, `.xls` → `415` naming Phase 3. Other extensions, or a
  `.csv` whose bytes are a PDF, ZIP/XLSX, OLE or binary → `415`.
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
(nullable), `merchantName`, `transactionType`. Only while
`READY_FOR_REVIEW`, else `409` → `{ row, stats }`.

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

## Analytics

Every figure comes from the deterministic engine over confirmed transactions.
`month` defaults to the latest month with data.

| Endpoint                                                         | Returns                                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /api/analytics/monthly?month=`                              | `{ month, availableMonths, totals, comparison }`                                                   |
| `GET /api/analytics/categories?month=&level=top\|leaf&parentId=` | `{ month, parent, items: CategoryBreakdownItem[] }`; `parentId` drills into one top-level category |
| `GET /api/analytics/merchants?month=&limit=` (≤ 50, default 10)  | `{ month, items: MerchantSummaryItem[] }`                                                          |
| `GET /api/analytics/trends?end=&months=` (≤ 24, default 6)       | `{ points: MonthlyTrendPoint[] }`                                                                  |

## Health

### `GET /api/health`

→ `{ status: "ok" }` when the database answers. Used by container health checks.

## Planned endpoints

| Phase | Endpoints                                                                     |
| ----- | ----------------------------------------------------------------------------- |
| 3     | PDF and XLSX parsing in `POST /api/imports`, duplicate review, merchant merge |
| 4     | `GET /api/insights`, recurring payments, deeper analytics                     |
| 5     | `GET/POST/PATCH /api/money-plan`, budgets, simulator                          |
| 6     | `POST /api/ai/chat`                                                           |
