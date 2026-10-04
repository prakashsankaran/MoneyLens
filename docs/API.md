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
| `FORBIDDEN`              | 403  | Reserved for future role checks                |
| `NOT_FOUND`              | 404  | Unknown route or resource                      |
| `CONFLICT`               | 409  | Email already registered                       |
| `PAYLOAD_TOO_LARGE`      | 413  | Body over limit                                |
| `UNSUPPORTED_MEDIA_TYPE` | 415  | Reserved for uploads                           |
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

### `POST /api/auth/logout`

Revokes the session family and clears the cookie → `200` `{ loggedOut: true }`.

### `GET /api/auth/me` 🔒

→ `{ id, email, name, createdAt }`

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

## Categories

### `GET /api/categories` 🔒

System categories plus the user's custom categories, as a two-level tree:
`[{ id, name, slug, parentId: null, color, icon, children: [...] }]`.

## Health

### `GET /api/health`

→ `{ status: "ok" }` when the database answers. Used by container health checks.

## Planned endpoints

These are designed but not implemented yet. Each phase adds them with tests:

| Phase | Endpoints                                                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2     | `GET/PATCH/DELETE /api/transactions[/:id]`, `POST/GET/DELETE /api/imports[/:id]` (CSV), category CRUD, `GET /api/analytics/{monthly,categories,merchants}`, data deletion endpoints |
| 3     | `POST /api/imports/:id/confirm`, import review row edits (PDF, XLSX)                                                                                                                |
| 4     | `GET /api/analytics/trends`, `GET /api/insights`                                                                                                                                    |
| 5     | `GET/POST/PATCH /api/money-plan`, budgets, simulator                                                                                                                                |
| 6     | `POST /api/ai/chat`                                                                                                                                                                 |
