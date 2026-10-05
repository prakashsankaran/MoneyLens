# Phase 5 summary

Date: 2026-10-05. Scope: the personal money plan, monthly budgets, the
health score's budget component and the what-if simulator (spec sections 17
and 18).

## What is implemented

### Planning engine (`packages/analytics`, pure and deterministic)

- **Spending kinds** (`plan.ts`). Every category is treated as one of:

  | Kind       | Categories                                                                    |
  | ---------- | ----------------------------------------------------------------------------- |
  | Commitment | Housing, rent, maintenance, EMIs, insurance                                   |
  | Investing  | Investments, SIPs, savings transfers                                          |
  | Essential  | Groceries, household, bills and utilities, transport, fuel, healthcare        |
  | Lifestyle  | Dining, food delivery, coffee, snacks, shopping, entertainment, subscriptions |
  | Other      | Everything else, such as transfers to people and uncategorised spending       |

- **Observed baseline.** Monthly averages of income and each kind over the
  latest three complete months before the current one. The plan, the
  suggested budgets and the simulator all start from it.
- **Money plan** (`buildMoneyPlan`). Income − fixed commitments − essential
  expenses − lifestyle expenses − other spending − investments = available
  surplus.
  - Each line says where it came from: "You entered", "From your
    transactions" (when the field was left empty) or "Calculated".
  - Goals are then taken from the surplus:
    - the monthly savings target;
    - the emergency fund gap spread over 12 months;
    - each upcoming major expense spread over the months until it is due.
  - The status is on track, tight (less than 5% of income left), shortfall,
    or incomplete when there is no income.
  - Suggestions are labelled RECOMMENDATION. They include the common 3–6
    months of essential costs emergency fund guideline, worked out from the
    user's own figures, and a note when entered commitments or income differ
    a lot from the transactions.
  - Suggested budgets: essential and lifestyle categories at their average,
    rounded up to ₹100. Lifestyle categories are reduced proportionally (at
    most 50%) only when the goals need it.
  - Every plan carries the disclaimer: "Educational planning suggestion …
    It is not professional financial advice."
- **Budgets** (`budgets.ts`). Each budget is per category per month.
  - Spending is net of refunds and includes subcategories.
  - Status is near at 80% used and over above 100%.
  - For the month in progress, a straight-line month-end projection is shown.
  - Spending in categories without a budget is reported.
- **Health score.** Budget adherence now has 10% of the weight (share of
  budgets kept, scored from 50% to 100%). The weights are now: savings 25%,
  discretionary 20%, cash flow 15%, stability 15%, obligations 15%, budgets
  10%. With no budgets for the month, the component is not measured and the
  score is the weighted average of the others, as before.
- **Budget insights.** A new rule (`budget-alerts`, 16 rules in all) flags
  budgets that are over, or on pace to go over, in the Planning group.
- **What-if simulator** (`simulator.ts`). It supports four kinds of change:
  - reduce a category by a percentage;
  - reduce a category by an amount, capped at its average, since spending
    cannot fall below zero;
  - save a fixed amount more;
  - change income by a signed amount.

  It reports the monthly and annual impact and the new monthly amount kept.
  - It projects the extra amount at 1, 3, 5 and 10 years, both as the amount
    put aside and with an assumed return compounded monthly.
  - The return is chosen by the user (0–15%; the screen starts at 6%).
  - Every result lists its assumptions, including "Returns are not
    guaranteed and can be lower or negative; inflation and tax are not
    included."

### API

| Endpoint                        | Purpose                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `GET /api/money-plan`           | Saved figures, the calculated plan and when it was saved |
| `POST /api/money-plan`          | Replace the figures and recalculate                      |
| `PATCH /api/money-plan`         | Change some figures and recalculate                      |
| `POST /api/money-plan/simulate` | Run a what-if scenario (nothing is saved)                |
| `GET /api/budgets?month=`       | Budgets with spending, status and projection for a month |
| `PUT /api/budgets/:month`       | Set or change budgets; an amount of `null` removes one   |

- The figures are stored in `FinancialProfile`. Each save also stores a
  `MoneyPlan` snapshot of the inputs and the result.
- Budgets are stored in `Budget`. Changing them refreshes insights, the
  dashboard, the report and the health score.
- Deleting all transactions keeps the plan and the budgets. Deleting the
  account removes them.

### Web (`/plan`, replacing the placeholder)

- **Plan tab.** The user's figures sit beside the calculated plan.
  - Each empty field shows what the transactions say, for example "Your
    transactions show about ₹10,000 a month."
  - The plan shows "Where your income goes" with the source of each line,
    the goals, "Left after goals", the suggestions, and the suggested
    budgets.
  - "Use these as budgets for October 2026" sets the suggested budgets in
    one step.
- **Budgets tab.**
  - A month selector, with totals for the amount budgeted, the amount spent
    in budgeted categories and the amount spent elsewhere.
  - A progress bar and status per budget, with the month-end projection.
  - Inline change and remove, and "Add a budget".
- **What if? tab.**
  - Example buttons from the spec: reduce food 20%, save ₹5,000 more,
    reduce shopping ₹3,000, income +₹10,000.
  - Up to ten changes, an assumed return field, and results with the
    projection table and the assumptions.
  - Errors name the change at fault ("Change 1: …").

On the demo data, with income ₹1,45,000 and a savings target of ₹25,000:

- **Plan:** the available surplus is ₹36,894, with ₹11,894 left after the
  goal, so the status is on track.
- **Emergency fund:** the suggested range is ₹1,53,333 to ₹3,06,666.
- **Simulator:** reducing food 20% and adding ₹10,000 of income keeps
  ₹15,215 more a month, ₹1,82,582 a year.

## Verification (run in the build environment)

| Check                                            | Result                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `npm run check` (format, lint, typecheck, tests) | pass                                                                                            |
| `npm test`                                       | **411 tests pass**: packages 126, API 235, web 50                                               |
| New engine tests                                 | Spending kinds, baseline, plan lines and goals, every status, budget cuts, budgets, simulator   |
| New API tests                                    | Auth, incomplete plan, save and PATCH, validation, isolation, simulator, budgets and health     |
| New web tests                                    | Save and calculate, suggested budgets, budget edit and remove, presets, field-level errors      |
| `npm run test:e2e`                               | **18 pass**: 9 tests at desktop and mobile sizes, including the plan, budgets and the simulator |
| `npm run build`                                  | pass                                                                                            |
| `npm audit --omit=dev`                           | Only the known Prisma `deepmerge-ts` advisory (see SECURITY.md)                                 |

## Technical decisions

- **Empty fields fall back to the transactions.** A user who enters only
  their income still gets a full plan, and each line says which figures
  were entered and which were observed.
- **Three complete months as the baseline.** The current month is partial,
  and three months smooth out a one-off without going stale.
- **The plan is recalculated on every read.** The saved snapshot is a
  record, and the plan on screen always reflects the current transactions.
- **Budgets are per month.** This matches the existing `Budget` table and
  lets a user set a different amount for a festival month.
- **The simulator has no default return.** The API defaults to 0%. The
  screen starts at 6%, visibly and editably, next to the statement that
  returns are not guaranteed.
- **Health weights were rebalanced** to make room for budgets, instead of
  being added on top.

## Assumptions

- The spending-kind mapping is by category slug. A user's own categories
  count as "other" unless they sit under a known parent.
- An emergency fund gap is spread over 12 months; an upcoming expense is
  spread evenly over the months left.
- "Tight" means less than 5% of income left after goals.
- The near-limit threshold for budgets is 80%.

## Issues encountered

- **The health and insight tests moved** when the weights changed and the
  16th rule arrived; their expected values were updated.
- **The first suggestion was the emergency fund guideline**, which buried
  the status. The status suggestion now always comes first.
- **The sign-in rate limit tripped again** when screenshots were taken right
  after an E2E run. Restarting the dev server resets it.

## What remains

| Phase | Next work                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------- |
| 6     | AIProvider, MoneyLens AI chat with guardrails, AI Money Brief                                     |
| 7     | Expo mobile app                                                                                   |
| 8     | Security hardening (parser time limits in a worker), performance, dark mode, E2E in CI, docs pass |
