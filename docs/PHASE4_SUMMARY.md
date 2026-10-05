# Phase 4 summary

Date: 2026-10-05. Scope: advanced analytics and period comparisons, recurring
payment detection, behaviour insights, potential saving opportunities, an
explainable financial health score, the monthly report and the Insights
screen.

## What is implemented

### Analytics engine (`packages/analytics`, pure and deterministic)

- **Recurring detection** (`recurring.ts`):
  - Groups payments and income by merchant and direction, one payment per day.
  - Matches the median gap to a frequency band:

    | Band      | Gap (days) | Tolerance (days) |
    | --------- | ---------- | ---------------- |
    | Weekly    | 6–8        | 2                |
    | Monthly   | 25–35      | 5                |
    | Quarterly | 84–98      | 10               |
    | Yearly    | 350–380    | 15               |

  - A series needs 3 occurrences (2 for yearly) and at least 75% of gaps
    within tolerance.
  - Confidence = 50% regularity, 30% amount stability and 20% history length.
  - Each series reports its typical amount, whether the amount varies, the
    next expected date (stepped by calendar month), its monthly and annual
    cost, whether it is still active and its transactions.
  - A merchant with mixed payments is split into amount bands, so Amazon
    Prime is found among Amazon orders.
  - "Subscription-like" means a near-fixed amount of ₹5,000 or less. Rent,
    EMIs, insurance, investments, transfers, transport passes, utilities and
    groceries are excluded.
- **Period comparisons and patterns** (`patterns.ts`):
  - Comparisons against the previous month, the 3- and 6-month averages
    (months with data only), the quarter so far and the year to date.
  - Category comparisons.
  - Weekday vs weekend per-day averages, totals by weekday and by week, and
    monthly volatility (coefficient of variation).
  - Largest payments, refunds, cashback, and transfers out and in.
- **Behaviour insights** (`insights.ts`): 15 rules that cover the 17
  behavioural patterns in the spec (category rise/fall with frequency vs size,
  month over month, small payments, weekend spending, payday spike, merchant
  and category concentration, volatility, repeated transfers,
  refunds/cashback, recurring and subscriptions, stopped series, large
  one-offs, unusual-for-merchant, upcoming payments).
  - Each insight carries:
    - group, title and severity;
    - the metric that triggered it;
    - the supporting transaction ids;
    - an explanation and a 0–1 confidence;
    - any recommendation, kept separate from the finding.
  - A rule that cannot run says why ("Needs at least 2 earlier months of
    data").
- **Potential saving opportunities** (`leakage.ts`):
  - Covers repeated small purchases, food delivery, rising discretionary
    spending, overlapping subscriptions in one category, and a merchant whose
    spending doubled.
  - Every title starts "Potential saving opportunity:".
  - Each has an estimated monthly saving and the assumption behind it (for
    example, "Bringing food delivery back to your 3-month average would save
    about ₹3,723 a month.").
  - The word "waste" is never used, and tests check for it.
- **Financial health score** (`health.ts`):
  - Five components, each a straight line between two stated limits:
    savings rate (30%), discretionary share (20%), cash-flow coverage (20%),
    expense stability (15%) and recurring obligations against income (15%).
  - Budget adherence is listed with weight 0 and the reason (budgets arrive
    in Phase 5).
  - The score is the weighted average of the measurable components. It is
    hidden when less than half the weight can be measured.
  - Every component returns its measured value and formula.
- **Monthly report** (`report.ts`): twelve sections against any comparison
  month.
  - The executive summary is built from templates filled with calculated
    figures, and each sentence is labelled CALCULATION or OBSERVATION.
  - Recommendations are labelled RECOMMENDATION.

### API

| Endpoint                                   | Purpose                                               |
| ------------------------------------------ | ----------------------------------------------------- |
| `GET /api/insights?month=`                 | Saving opportunities and insights, plus skipped rules |
| `GET /api/recurring`                       | Detected series with monthly and annual totals        |
| `PATCH /api/recurring/:id`                 | Dismiss ("not recurring") or restore a series         |
| `GET /api/analytics/health?month=`         | Health score with its components and method           |
| `GET /api/analytics/comparisons?month=`    | Period and category comparisons, patterns             |
| `GET /api/reports/monthly?month=&compare=` | The monthly report                                    |
| `GET /api/transactions?ids=`               | The transactions behind an insight                    |
| `GET /api/dashboard`                       | Now also returns `savingOpportunities` and `health`   |

- **Detected series are stored.** One `RecurringPayment` row is kept per
  series, keyed so a dismissal survives re-detection, and the series'
  transactions are flagged, so the existing `recurring=true` transaction
  filter now works.
- **When detection re-runs:** after an import is confirmed or deleted, a
  transaction is edited or deleted, a merchant is renamed or merged, and
  after seeding. A failed refresh is logged and does not fail the user's
  change.
- **Insights are not stored.** They, the reports and the score are computed
  on request, so they always match the current data.

### Web

- **Insights** (`/insights`):
  - Group tabs with counts: All, Spending, Saving, Behaviour, Recurring,
    Anomalies, Planning.
  - Each card shows the provenance badge, severity, metric, potential saving,
    confidence, assumption and suggestion, and can load the transactions
    behind it.
  - The Recurring tab lists every series with a "Not recurring" / "Restore"
    action.
  - A health score card shows the full breakdown.
  - Rules that could not run are listed with their reasons.
- **Monthly report** (`/reports`, new nav item):
  - Twelve numbered sections, with month and "Compare with" selectors.
  - It can be printed.
- **Analytics:**
  - A period comparison table.
  - "When do I spend?" by weekday and by week.
  - Largest payments, refunds, cashback, transfers and volatility.
- **Dashboard:**
  - "Where can I potentially save?" now leads with saving opportunities and
    their estimated savings.
  - A new health score card links to the full working.

On the demo data for September 2026 the app finds:

- **Recurring:** 13 series, including salary, rent, SIP, LIC, utilities and
  four subscriptions. Recurring payments come to ₹59,493 a month.
- **Saving opportunities:** food delivery, small purchases, and two OTT
  subscriptions.
- **Health score:** 93.

## Verification (run in the build environment)

| Check                                            | Result                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `npm run check` (format, lint, typecheck, tests) | pass                                                                                                      |
| `npm test`                                       | **376 tests pass**: packages 109, API 222, web 45                                                         |
| New engine tests                                 | Every insight rule, each leakage check, each health component and rescaling, recurring edge cases, report |
| New API tests                                    | Auth on every new endpoint, cross-user isolation, dismiss/restore, re-detection after deletes, `ids`      |
| `npm run test:e2e`                               | **14 pass**: 7 tests at desktop and mobile sizes, including Insights, the report and comparisons          |
| `npm run build`                                  | pass                                                                                                      |
| `npm audit --omit=dev`                           | Only the known Prisma `deepmerge-ts` advisory (see SECURITY.md)                                           |

## Technical decisions

- **Compute on read, store only what users change.** Insights depend on the
  month viewed and on today's date, so caching them would mean invalidating
  on every edit. The data is one user's year of transactions, so computing on
  request is fast. Only recurring series are stored, because users dismiss
  them and the transaction filter needs the flag.
- **A key per series** (`merchant|direction`, plus an amount band for mixed
  merchants) lets a dismissal stick after re-detection, and lets a dismissed
  series that disappears and returns stay dismissed.
- **Series are judged at the end of the month viewed.** Viewing an older
  month shows what was active then, not today.
- **Monthly due dates step by calendar month**, so a bill on the 5th is due
  on the 5th, not "every 31 days".
- **Rules return a skip reason** instead of silently returning nothing, so
  the screen can say why a check did not run.

## Assumptions

- The thresholds are constants beside each rule. Examples: weekend spending
  at 1.5x, merchant concentration at 30% of non-recurring spending, a large
  one-off at ≥ ₹5,000 and 10x the median, and a small purchase under ₹300.
  They are starting values, chosen so the demo data gives sensible results
  without flagging everything.
- Saving estimates state their assumption (for example, "skip one in four")
  and are not predictions.
- SIPs, investments and savings transfers are not counted as obligations in
  the health score.

## Issues encountered

- **Due dates drifted.** A monthly test caught the next due date landing a
  day late, because the median gap was 31 days. Due dates now step by
  calendar month.
- **Subscriptions were too broad at first.** The first demo run called the
  water bill and metro pass subscriptions, and counted SIPs as obligations.
  Deny-lists by category fixed both.
- **The sign-in rate limit tripped in testing.** Running the E2E suite twice
  within 15 minutes exceeded it (20 sign-ins per 15 minutes) and failed the
  second run. Restarting the dev server resets it. The limit itself is
  unchanged.

## What remains

| Phase | Next work                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------- |
| 5     | Financial profile, money plan, budgets (then the health score's budget component), what-if simulator |
| 6     | AIProvider, MoneyLens AI chat with guardrails, AI Money Brief                                        |
| 7     | Expo mobile app                                                                                      |
| 8     | Security hardening (parser time limits in a worker), performance, dark mode, E2E in CI, docs pass    |
