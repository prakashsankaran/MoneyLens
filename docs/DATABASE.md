# Database

PostgreSQL 16 through Prisma 6. The schema is
[`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma) and the
migrations are in `apps/api/prisma/migrations/`.

The full schema for every planned entity was created in Phase 1, so later
phases add behaviour rather than restructure tables. As of Phase 2 the code
reads and writes `User`, `Session`, `Category`, `Merchant`, `MerchantAlias`,
`UserCategoryRule`, `Transaction`, `Import` and `ImportTransaction`. The
remaining tables exist but are unused until their phase.

Phase 2 added one column, `Import.warnings` (JSON, file-level parser notes),
in migration `20261004205827_import_warnings`.

Phase 4 started writing `RecurringPayment` and `Transaction.isRecurring` /
`recurringGroupId`. Migration `20261005071500_recurring_series` adds
`RecurringPayment.key` (unique per user), `flow` and `isActive`. It clears the
table first; it was never written before, and detection repopulates it.

## Conventions

- `cuid` string primary keys.
- **Every user-owned row has `userId` with `ON DELETE CASCADE`.** Deleting a
  user removes all of their financial data in one statement, which backs
  "delete my account".
- Money is `Decimal(14,2)` in rupees (up to ₹999,999,999,999.99). Code converts
  it to integer paise at the boundary. A check constraint keeps
  `Transaction.amount` and `ImportTransaction.amount` positive, and direction
  lives in `flow`.
- Timestamps are `timestamptz`. Statement dates without a time are stored at
  12:00 IST by the importers. `Budget.month` and statement periods
  (`Import.statementStart/End`) are `date`.
- Sensitive identifiers (`upiId`, `transactionReference`) are stored because
  duplicate detection needs them. API responses always mask them, including
  inside free-text descriptions (`maskUpiId`, `maskTail`,
  `maskIdentifiersInText` in `@moneylens/shared`). References are stored
  normalised (leading zeros removed) so the same UPI RRN matches across
  statement formats.
- `Import.storageKey` stays `NULL`: raw statement files are parsed in memory
  and never written to disk.

## Entities

| Entity                         | Purpose                                                                                                                                      | Key relations / indexes                                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `User`                         | Account. `passwordHash` is argon2id                                                                                                          | unique `email`                                                                                                                                                     |
| `Session`                      | Refresh-token session. Stores a SHA-256 hash, never the token                                                                                | unique `tokenHash`; `userId`; `familyId` for theft detection                                                                                                       |
| `Category`                     | Hierarchical categories. System rows have `userId = NULL`; subcategories have `parentId`                                                     | unique `(userId, parentId, slug)` + partial unique index for system rows                                                                                           |
| `Merchant`                     | Normalised merchant per user with default and user-override category                                                                         | unique `(userId, normalizedName)`                                                                                                                                  |
| `MerchantAlias`                | Raw statement strings (e.g. `SWIGGY*FOOD`) mapped to a merchant                                                                              | unique `(merchantId, aliasKey)`; index `aliasKey`                                                                                                                  |
| `UserCategoryRule`             | User corrections promoted to rules (merchant / description / UPI match)                                                                      | unique `(userId, matchField, pattern)`                                                                                                                             |
| `Transaction`                  | Normalised transaction                                                                                                                       | indexes `(userId, transactionDate)`, `(userId, categoryId)`, `(userId, merchantId)`, `(userId, transactionType)`, `sourceFileId`, `(userId, transactionReference)` |
| `Import`                       | An uploaded statement (metadata and hash only) and its processing state                                                                      | `(userId, createdAt)`, `(userId, sha256)` to detect re-uploads                                                                                                     |
| `ImportTransaction`            | Parsed row awaiting review; `decision`, `duplicateOfId`, `warnings`                                                                          | unique `(importId, rowIndex)`                                                                                                                                      |
| `RecurringPayment`             | Detected recurring series (frequency, typical amount, next expected, `isActive`, dismissal). `key` identifies the series across re-detection | unique `(userId, key)`                                                                                                                                             |
| `Insight`                      | Reserved for persisted insights (e.g. AI output in Phase 6). Phase 4 insights are computed on request and not stored                         | unique `(userId, key)`                                                                                                                                             |
| `Budget`                       | Monthly budget per category                                                                                                                  | unique `(userId, categoryId, month)`                                                                                                                               |
| `FinancialProfile`             | Self-declared income/commitments for planning                                                                                                | unique `userId`                                                                                                                                                    |
| `MoneyPlan`                    | Versioned plan inputs and computed allocation (JSON)                                                                                         | `userId`                                                                                                                                                           |
| `AIConversation` / `AIMessage` | Assistant history, with provider and context reference                                                                                       | `(userId, updatedAt)`, `(conversationId, createdAt)`                                                                                                               |

Composite indexes lead with `userId` because every query is scoped to one
user. That is also the authorisation boundary (see SECURITY.md).

### Spec deviations

- **No separate `Subcategory` table.** Subcategories are `Category` rows with
  `parentId`. `Transaction` still has both `categoryId` (top level) and
  `subcategoryId` (leaf), as specified.
- **Added `Transaction.flow`** (`IN`/`OUT`), because `TRANSFER`, `UNKNOWN` and
  `REFUND` need a direction.
- **Added `Session`** for refresh-token rotation.
- **Added `Transaction.status`** values: `CONFIRMED`, `PENDING_REVIEW` and
  `EXCLUDED`. Analytics read only `CONFIRMED`.

## Commands

```bash
npm run db:migrate   # prisma migrate dev: create + apply migrations (development)
npm run db:deploy    # prisma migrate deploy: apply only (CI, Docker, production)
npm run db:seed      # categories + demo user (refuses NODE_ENV=production)
npm run db:reset     # drop and recreate the development database
npm run db:generate  # regenerate the Prisma client
```

To change the schema, edit `schema.prisma`, run `npm run db:migrate -- --name
<change>`, review the generated SQL, and commit both files.

## Seed data

`npm run db:seed` upserts the system category tree and recreates
`demo@moneylens.app` (password `moneylens-demo`) with about 400 transactions
over the six most recent complete months. The data is fictional and
deterministic: a fixed-seed PRNG in `prisma/demo/demo-data.ts`. It is built
to tell a story the dashboard can explain:

- Salary on the 1st, then rent, SIP, insurance, a family transfer and a self-transfer
- Bills (Airtel, Jio, BESCOM, with higher electricity in April–June, BWSSB)
  and subscriptions (Netflix, Spotify)
- Food delivery (Swiggy, Zomato) rising in both frequency and order size
- Many small coffee and snack payments
- A ₹24,999 one-off Flipkart purchase and an Amazon refund
- Cabs (Uber, Ola), fuel, metro, groceries (DMart, Reliance), movies and pharmacy
