# Phase 6 summary

Date: 2026-10-05. Scope: the AIProvider layer, MoneyLens AI chat with
guardrails (spec sections 19–21), and the AI Money Brief on the dashboard.
The full design is in [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md).

## What is implemented

### Engine (`packages/analytics/src/assistant.ts`, pure)

- **`assistantContext()`** collects everything the assistant may say about a
  month: totals and the change from last month, comparisons, top-level and
  subcategory changes, top merchants, the trend, recurring payments, saving
  opportunities with a running total, insights, the health score and the
  saved plan. Every derived number is calculated here.
- **`spendingDriver()`** answers "frequency or transaction size?" by
  comparing the change in payment count with the change in average payment,
  using a 10% threshold.
- **Data limitations** are stated as sentences, for example a single month of
  data, few earlier months, or a month still in progress.
- `categoryComparisons` can now work at subcategory level.

### API (`apps/api/src/modules/ai`)

| Endpoint                           | Purpose                                        |
| ---------------------------------- | ---------------------------------------------- |
| `POST /api/ai/chat`                | Ask a question (new or existing conversation)  |
| `GET /api/ai/status`               | Whether AI is set up, and questions used today |
| `GET /api/ai/brief?month=`         | The AI Money Brief for the dashboard           |
| `GET /api/ai/conversations`        | The user's conversations                       |
| `GET /api/ai/conversations/:id`    | One conversation with its messages and figures |
| `DELETE /api/ai/conversations/:id` | Delete one conversation                        |
| `DELETE /api/ai/conversations`     | Delete all of them                             |

- **Providers:**
  - Anthropic (Messages API) and any OpenAI-compatible service, both over
    `fetch` with a timeout.
  - A deterministic mock for tests.
  - `none`, the default, which sends nothing anywhere.
- **Every answer** carries its status (`answered`, `not-configured`,
  `fallback`, `unavailable`, `refused`), the calculated facts, the AI text
  (or null), the data limitations, and the provider that wrote it.
- **Guardrails:**
  - Credential and illegal requests are refused before anything is stored or
    sent.
  - Identifiers in questions are masked.
  - The system prompt forbids arithmetic and invention.
  - Every ₹ amount and % the model writes is checked against the context. A
    failed check gets one regeneration, then only the figures are shown.
- **Limits:**
  - Questions per user per minute and per 24 hours.
  - The brief has a separate per-minute budget.
  - Output tokens are capped.
- **Deleting all transactions** now also deletes AI conversations, because
  they quote those figures.
- **CORS now allows `PUT`.** The Phase 5 budgets endpoint needs it when the
  web app is served from another origin.

### Web

- **MoneyLens AI (`/assistant`)** replaces the "not available yet" page.
  - It offers the nine example questions from the brief and lists past
    conversations (a sidebar on desktop, a selector on phones). Each one can
    be deleted.
  - Each reply shows the AI text labelled "AI interpretation", any data
    limitations, and a "The figures behind this answer" list with Calculated
    and Observation badges. A note says that every amount was checked.
  - When AI is not set up, the screen says so, and each question still gets
    its figures.
  - Refusals are shown as plain text.
- **The AI Money Brief** on the dashboard shows the written brief with the
  figures it came from, or just the figures with the reason there is no text.
- The unused `PlannedFeaturePage` placeholder was removed. Every web screen
  in the spec now exists.

### On the demo data (September 2026)

| Question                                                                  | What the figures show                                                                                                                                    |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Why did I spend more this month?"                                        | Spending was ₹1,03,283, up ₹4,798 (4.9%) from August. Shopping rose ₹5,460, mainly from more Online Shopping payments.                                   |
| "Did my food spending increase because of frequency or transaction size?" | Food overall barely moved (39 vs 38 payments, ₹717 vs ₹695 each). Food Delivery rose on both counts: payments up 18.8% and the average payment up 15.1%. |
| "Where can I save ₹5,000?"                                                | Three potential saving opportunities total about ₹4,482 a month, which is less than ₹5,000, so the answer says that cuts elsewhere would be needed.      |

## Verification (run in the build environment)

| Check                                            | Result                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `npm run check` (format, lint, typecheck, tests) | pass                                                                                      |
| `npm test`                                       | **478 tests pass**: packages 131, API 293, web 54                                         |
| AI evaluation                                    | The nine example questions on demo data: routing, expected figures, no "waste"            |
| Guardrail tests                                  | Credentials, illegal requests, masking, invented figures, regeneration, fallback, wording |
| `npm run test:e2e`                               | **22 pass**: 11 tests at desktop and mobile sizes, including MoneyLens AI and the brief   |
| `npm run build`                                  | pass                                                                                      |

No real AI provider was called in this environment because there is no API
key. The Anthropic and OpenAI-compatible providers are tested against stubbed
HTTP responses: the request shape, response parsing and error handling.

## Technical decisions

- **Figures first, AI second.** Every answer works without a model. The model
  adds explanation, never information, so a missing key, an outage or a
  failed check costs the explanation, never the answer.
- **Check figures rather than trust the prompt.** The prompt asks the model
  not to calculate. The figure check makes sure it didn't, and anything it
  cannot back up is not shown.
- **Keyword routing.** It is predictable and testable. A miss falls back to
  the overview, which still answers with real figures.
- **`fetch` instead of vendor SDKs.** This keeps both providers small and
  vendor-neutral and adds no dependencies.
- **The brief is cached by its figures.** It is rewritten only when the
  numbers change, so dashboard visits do not each call the model.

## Issues encountered

- **The E2E suite outgrew the sign-in limit.** With 22 tests it needs more
  than the default of 20 sign-ins per 15 minutes. A saved session cannot be
  shared, because refresh-token reuse revokes the session family. The new
  `npm run dev:e2e` starts the dev servers with `AUTH_RATE_LIMIT=500` for
  that run, and Playwright uses it. The default limit is unchanged.
- **The brief shared the per-minute chat limit.** End-to-end tests showed
  that loading the dashboard repeatedly could block questions. The brief now
  has its own budget, and a test covers it.
- **Asking whether food rose "because of frequency or size" first answered
  for Food as a whole,** which hid the real change in Food Delivery. The
  answer now also explains the subcategory that moved most.

## How to turn it on

In `apps/api/.env`:

```
AI_PROVIDER=anthropic
AI_API_KEY=<your key>
# AI_MODEL=claude-sonnet-5-5
```

Or use any OpenAI-compatible service with `AI_PROVIDER=openai-compatible`,
`AI_BASE_URL` and `AI_MODEL`. Restart the API.

## What remains

| Phase | Next work                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------- |
| 7     | Expo mobile app (upload, review, dashboard, insights, ask AI on device)                           |
| 8     | Security hardening (parser time limits in a worker), performance, dark mode, E2E in CI, docs pass |
